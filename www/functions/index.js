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
        db.collection('mail').add({
          to: session.participants[i].email,
          template: {
            name: 'session-confirmation',
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
        updated_participants[i].confirmed = true;
      }
    }
    db.collection('sessions').doc(session.id).set({participants: updated_participants}, {merge: true});
});

exports.sendCancel = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate((change, context) => {
    functions.logger.log('send cancel');
    let session = change.after.data();
    let after = change.after.data().participants;
    let before = change.before.data().participants;
    functions.logger.log('after = '+after.length)
    functions.logger.log('before = '+before.length)
    
    for (let b=0; b<before.length; b++) {
      console.log('checking pid '+before[b].pid)
      let found = false;
      for (let a=0; a<after.length; a++) {
        if (before[a].pid === before[b].pid) { found = true; }
      }
      if (!found) {
        functions.logger.log('sending cancel to ' + before[b].name);
        db.collection('mail').add({
          to: before[b].email,
          template: {
            name: 'cancel-confirmation',
            data: {
              name: before[b].name,
              datetime: session.datetime
            }
          }
        });
      }
    }
});

exports.sendWrapup = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate((change, context) => {
    let session = change.after.data();
    if (session.world_name && !session.sent_wrapup) {
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
          name: 'session-wrapup',
          data: {
            names: names.join(', '),
            world_name: session.world_name
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
