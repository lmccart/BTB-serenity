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
    console.log('send confirm');
    let session = change.after.data();
    let updated_participants = [];
    for (let i=0; i<session.participants.length; i++) {
      updated_participants[i] = session.participants[i];
      if (!session.participants[i].confirmed) {
        let html = 'Dear ' + session.participants[i].name + ',';
        html += '<br><br>Your session registration is confirmed for '+session.datetime+'.';
        html += '<br><br>At that time, please connect at <a href="'+session.session_url+'">'+session.session_url+'</a>.';
        html += '<br><br>If you are unable to attend, please <a href="'+session.cancel_url+'">click here to cancel</a>.';
        html += '<br><br>Sincerely,';
        html += '<br>Tony Patrick, Lauren Lee McCarthy, and Grace Lee';
        html += '<br>Artists, Beyond the Breakdown';
        let msg = {
          to: session.participants[i].email,
          message: {
            subject: 'Beyond the Breakdown session confirmation',
            html: html
          },
        };
        db.collection('mail').add(msg);
        updated_participants[i].confirmed = true;
      }
      db.collection('sessions').doc(session.id).set({participants: updated_participants}, {merge: true});
    }
});

exports.sendCancel = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate((change, context) => {
    console.log('send cancel');
    let session = change.after.data();
    let after = change.after.data().participants;
    let before = change.before.data().participants;
    
    for (let b=0; b<before.length; b++) {
      let found = false;
      for (let a=0; a<after.length; a++) {
        if (a.pid === b.pid) {
          found = true;
        }
      }
      if (!found) {
        console.log('sending cancel to ' + before[b].name);
        let html = 'Dear ' + before[b].name + ',';
        html += '<br><br>Your registration for the session scheduled for '+ session.datetime +' has been cancelled.';
        html += ' To make a new registration, you can visit <a href="http://beyond-the-breakdown.web.app">beyond-the-breakdown.web.app</a>.';
        html += '<br><br>Sincerely,';
        html += '<br>Tony Patrick, Lauren Lee McCarthy, and Grace Lee';
        html += '<br>Artists, Beyond the Breakdown';
        let msg = {
          to: before[b].email,
          message: {
            subject: 'Beyond the Breakdown cancellation confirmation',
            html: html
          },
        };
        db.collection('mail').add(msg);
      }
    }
});

exports.sendWrapup = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate((change, context) => {
    let session = change.after.data();
    if (session.world_name && !session.wrapup_sent) {
      console.log('sending wrapup to ' + session.id);
      let emails = [];
      let names = [];
      for (let i=0; i<session.participants.length; i++) {
        emails.push(session.participants[i].email);
        names.push(session.participants[i].name);
      }

      let html = 'Dear ';
      for (let n of names) {
        html += n + ', ';
      }
      html += '<br><br>Your session is now complete. Thank you for building the world ' + session.world_name +' together.';
      html += '<br><br>Sincerely,';
      html += '<br>Tony Patrick, Lauren Lee McCarthy, and Grace Lee';
      html += '<br>Artists, Beyond the Breakdown';
      let msg = {
        to: emails,
        message: {
          subject: 'Beyond the Breakdown session wrap-up',
          html: html
        },
      };
      db.collection('mail').add(msg);
      db.collection('sessions').doc(session.id).set({wrapup_sent: true}, {merge: true});
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
      if(diff < 6 * 60 * 60 * 1000 && !session.reminder_sent) { // 6 hours
        for (let i=0; i<session.participants.length; i++) {
          let html = 'Dear ' + session.participants[i].name + ',';
          html += '<br><br>This is a reminder that your Beyond the Breakdown session is confirmed for '+session.datetime+'.';
          html += '<br><br>At that time, please connect at <a href="'+session.session_url+'">'+session.session_url+'</a>.';
          html += '<br><br>If you are unable to attend, please <a href="'+session.participants[i].cancel_url+'">click here to cancel</a>.';
          html += '<br><br>Sincerely,';
          html += '<br>Tony Patrick, Lauren Lee McCarthy, and Grace Lee';
          html += '<br>Artists, Beyond the Breakdown';
          let msg = {
            to: session.participants[i].email,
            message: {
              subject: 'Beyond the Breakdown session reminder',
              html: html
            },
          };
          db.collection('mail').add(msg);
        }
        db.collection('sessions').doc(session.id).set({reminder_sent: true}, {merge: true});
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
        console.log('sending wrapup to ' + session.id);
        let emails = [];
        let names = [];
        for (let i=0; i<session.participants.length; i++) {
          emails.push(session.participants[i].email);
          names.push(session.participants[i].name);
        }

        let html = 'Dear ';
        for (let n of names) {
          html += n + ', ';
        }
        html += '<br><br>One year ago you built the world ' + session.world_name +' together. Where is it now?';
        html += '<br><br>Sincerely,';
        html += '<br>Tony Patrick, Lauren Lee McCarthy, and Grace Lee';
        html += '<br>Artists, Beyond the Breakdown';
        let msg = {
          to: emails,
          message: {
            subject: 'Beyond the Breakdown one year reflection',
            html: html
          },
        };
        db.collection('mail').add(msg);
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