const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.refresh = functions.https.onRequest((req, res) => {
  let now = new Date().getTime();
  db.collection('sessions').onSnapshot(function(snapshot) {
    snapshot.docChanges().forEach(function(change) {
      let slot = change.doc.data();
      if (slot.hold && now - slot.hold > 11*60*1000) { // 11 minutes
        s = {hold: false};
        db.collection('sessions').doc(slot.id).set(s, {merge: true});
      }
    });
    res.json({success: true});
  });
});

exports.sendConfirm = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate((change, context) => {
    functions.logger.log('send confirm');
    let session = change.after.data();
    let updated_participants = [];
    for (let i=0; i<session.participants.length; i++) {
      updated_participants[i] = session.participants[i];
      if (!session.participants[i].confirmed) {
        let d = {
          name: session.participants[i].name,
          datetime: session.datetime,
          url_session: session.url_session,
          url_cancel: session.participants[i].url_cancel,
          caption: session.accessiblity_caption || false,
          asl: session.accessiblity_asl || false
        };
        console.log(d)
        db.collection('mail').add({
          to: session.participants[i].email,
          template: {
            name: 'session-confirmation',
            data: d
          }
        });
        updated_participants[i].confirmed = true;
      }
    }
    db.collection('sessions').doc(session.id).set({participants: updated_participants}, {merge: true});
});

exports.sendCancel = functions.https.onCall((data, context) => {
  functions.logger.log('send cancel');
  for (let p of data.participants) {
    functions.logger.log('sending cancel to ' + p.name);
    db.collection('mail').add({
      to: p.email,
      template: {
        name: 'cancel-confirmation',
        data: {
          name: p.name,
          datetime: data.datetime
        }
      }
    });
  }
});

exports.sendWrapup = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate((change, context) => {
    let session = change.after.data();
    if (session.world_values && !session.sent_wrapup) {
      functions.logger.log('sending wrapup to ' + session.id);
      let emails = [];
      let names = [];
      for (let i=0; i<session.participants.length; i++) {
        emails.push(session.participants[i].email);
        names.push(session.participants[i].name);
      }
      let wn = session.world_name || '';
      db.collection('mail').add({
        to: emails,
        template: {
          name: 'session-wrapup',
          data: {
            names: names.join(', '),
            world_name: wn,
            world_values: session.world_values,
            world_actions: session.world_actions
          }
        }
      });
      db.collection('sessions').doc(session.id).set({sent_wrapup: true}, {merge: true});
    }
});

exports.checkReminder = functions.https.onRequest((req, res) => {
  let code = req.query.code;
  if (code !== 'check') return res.json(false);

  db.collection('sessions').get()
  .then(snapshot => {
    snapshot.forEach(doc => {
      let session = doc.data();
      let when = new Date(session.datetime);
      let today = new Date();
      let diff = when.getTime() == today.getTime();
      if(diff < 6 * 60 * 60 * 1000 && !session.sent_reminder) { // 6 hours
        for (let i=0; i<session.participants.length; i++) {
          db.collection('mail').add({
            to: session.participants[i].email,
            template: {
              name: 'session-reminder',
              data: {
                name: session.participants[i].name,
                datetime: session.datetime,
                url_session: session.url_session,
                url_cancel: session.participants[i].url_cancel,
                caption: session.accessiblity_caption || false,
                asl: session.accessiblity_asl || false
              }
            }
          });
        }
        db.collection('sessions').doc(session.id).set({sent_reminder: true}, {merge: true});
      }
    });
    res.json({success: true});
  });
});

exports.checkOneYear = functions.https.onRequest((req, res) => {
  let code = req.query.code;
  if (code !== 'check') return res.json(false);

  const snapshot = db.collection('sessions').get()
  .then(snapshot => {
    snapshot.forEach(doc => {
      let session = doc.data();
      let when = new Date(session.datetime);
      let today = new Date();
      today.setFullYear(today.getFullYear() - 1);
      let diff = when.getTime() == today.getTime();
      if(diff < 12 * 60 * 60 * 1000 && !session.oneyear_sent) { // 12 hours, 1 year
        functions.logger.log('sending wrapup to ' + session.id);
        let emails = [];
        let names = [];
        for (let i=0; i<session.participants.length; i++) {
          emails.push(session.participants[i].email);
          names.push(session.participants[i].name);
        }
        db.collection('mail').add({
          to: emails,
          template: {
            name: 'session-reflection',
            data: {
              names: names.join(', '),
              world_name: session.world_name
            }
          }
        });
        db.collection('sessions').doc(session.id).set({oneyear_sent: true}, {merge: true});
      }
    });
    res.json({success: true});
  });
});


exports.getChat = functions.https.onRequest((req, res) => {
  let sessionId = req.query.sessionId;

  let messages = [];
  db.collection('messages').get()
  .then(snapshot => {
    snapshot.forEach(doc => {
      if (doc.data().sessionId === sessionId && doc.data().type === 'group-chat') {
        messages.push(doc.data());
      }
    });
    messages.sort((a, b) => {
      return a.timestamp < b.timestamp;
    });
    let results = messages.map(a => a.val.userName + ': ' + a.val.msg + '\n');
    res.send(results);
  });
});