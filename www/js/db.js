const app = firebase.app();
firebase.auth().signInAnonymously().catch(function(error) { console.log(error); });
firebase.auth().onAuthStateChanged(function(user) { });
const db = firebase.firestore(app);

let times = [
  'Thu Jan 28 2021 13:00:00 GMT-0800 (Pacific Standard Time)',

  'Fri Jan 29 2021 10:00:00 GMT-0800 (Pacific Standard Time)',
  'Fri Jan 29 2021 11:30:00 GMT-0800 (Pacific Standard Time)',
  'Fri Jan 29 2021 16:30:00 GMT-0800 (Pacific Standard Time)',
  'Fri Jan 29 2021 18:00:00 GMT-0800 (Pacific Standard Time)',
  'Fri Jan 29 2021 19:30:00 GMT-0800 (Pacific Standard Time)',

  'Sat Jan 30 2021 10:00:00 GMT-0800 (Pacific Standard Time)',
  'Sat Jan 30 2021 11:30:00 GMT-0800 (Pacific Standard Time)',
  'Sat Jan 30 2021 16:30:00 GMT-0800 (Pacific Standard Time)',
  'Sat Jan 30 2021 18:00:00 GMT-0800 (Pacific Standard Time)',
  'Sat Jan 30 2021 19:30:00 GMT-0800 (Pacific Standard Time)',

  'Sun Jan 31 2021 10:00:00 GMT-0800 (Pacific Standard Time)',
  'Sun Jan 31 2021 11:30:00 GMT-0800 (Pacific Standard Time)',
  'Sun Jan 31 2021 16:30:00 GMT-0800 (Pacific Standard Time)',
  'Sun Jan 31 2021 18:00:00 GMT-0800 (Pacific Standard Time)',
  'Sun Jan 31 2021 19:30:00 GMT-0800 (Pacific Standard Time)',

  'Mon Feb 1 2021 10:00:00 GMT-0800 (Pacific Standard Time)',
  'Mon Feb 1 2021 11:30:00 GMT-0800 (Pacific Standard Time)',
  'Mon Feb 1 2021 16:30:00 GMT-0800 (Pacific Standard Time)',
  'Mon Feb 1 2021 18:00:00 GMT-0800 (Pacific Standard Time)',
  'Mon Feb 1 2021 19:30:00 GMT-0800 (Pacific Standard Time)',

  'Tue Feb 2 2021 10:00:00 GMT-0800 (Pacific Standard Time)',
  'Tue Feb 2 2021 11:30:00 GMT-0800 (Pacific Standard Time)',
  'Tue Feb 2 2021 16:30:00 GMT-0800 (Pacific Standard Time)',
  'Tue Feb 2 2021 18:00:00 GMT-0800 (Pacific Standard Time)',
  'Tue Feb 2 2021 19:30:00 GMT-0800 (Pacific Standard Time)'
];

// populateSlots();
function populateSlots() {
  let batch = db.batch();
  let slots = [];
  for (let i=0; i<times.length; i++) {
    let id = makeid(i, 6);
    let s = {
      datetime: times[i],
      hold: false,
      accessible: false,
      closed: false,
      participants: [],
      sent_reminder: false,
      sent_wrapup: false,
      id: id,
      url_session: 'https://beyondthebreakdown.world/welcome/?sessionId='+id,
      url_cancel: 'https://beyondthebreakdown.world/cancel/?sessionId='+id
    };
    slots.push(s);
    // batch.set(db.collection('sessions').doc(s.id), s);
  }
  console.log(slots);
  batch.commit().then(function () {
    console.log('success')
  });
}


function makeid(i, length) {
  let result           = String(i).padStart(2, '0');
  let characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let charactersLength = characters.length;
  for ( let i = 0; i < length-2; i++ ) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}


