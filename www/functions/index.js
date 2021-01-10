const firebaseConfig = {
  apiKey: "AIzaSyDtf01NTsVT4k_lntP_NpqRxAnUZ9uPTlk",
  authDomain: "beyond-the-breakdown.firebaseapp.com",
  databaseURL: "https://beyond-the-breakdown.firebaseio.com",
  projectId: "beyond-the-breakdown",
  storageBucket: "beyond-the-breakdown.appspot.com",
  messagingSenderId: "516765643646",
  appId: "1:516765643646:web:3c2001a0fdf413c457392f",
  measurementId: "G-95RNYT6BL4"
};
const app = firebase.initializeApp(firebaseConfig);
firebase.auth().signInAnonymously().catch(function(error) { console.log(error); });
firebase.auth().onAuthStateChanged(function(user) { });
const db = firebase.firestore(app);

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
              url_session: session.participants[i].url_session,
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
                url_session: session.participants[i].url_session,
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



// exports.testEmail = functions.https.onRequest((req, res) => {
//   let html = 'Dear ______,';
//   html += '<br><br>Your registration for the session scheduled for _____ has been cancelled.';
//   html += 'To make a new registration, you can visit <a href="http://beyond-the-breakdown.web.app">beyond-the-breakdown.web.app</a>.';
//   html += '<br><br>Sincerely,';
//   html += '<br>Tony Patrick, Lauren Lee McCarthy, and Grace Lee';
//   html += '<br>Artists, Beyond the Breakdown';
//   let msg = {
//     to: 'laurenleemccarthy@gmail.com',
//     message: {
//       subject: 'Beyond the Breakdown cancellation confirmation',
//       html: html
//     },
//   };
//   db.collection('mail').add(msg);
//   res.json(msg);
// });