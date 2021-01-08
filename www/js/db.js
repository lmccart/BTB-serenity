
// Setup firebase app
let app = firebase.app();
firebase.auth().signInAnonymously().catch(function(error) { console.log(error); });
firebase.auth().onAuthStateChanged(function(user) { });
let db = firebase.firestore(app);
console.log(db)

let times = [
  '2021-01-28T00:10:00 GMT-0800 (Pacific Standard Time)',
  '2021-01-28T00:11:00 GMT-0800 (Pacific Standard Time)',
  '2021-01-28T00:12:00 GMT-0800 (Pacific Standard Time)',
  '2021-01-28T00:13:00 GMT-0800 (Pacific Standard Time)',
  '2021-01-28T00:14:00 GMT-0800 (Pacific Standard Time)',
];

// populateSlots();
function populateSlots() {
  let slots = [];
  for (let i=0; i<times.length; i++) {
    let id = makeid(8);
    let s = {
      datetime: times[i],
      hold: false,
      closed: false,
      participants: [],
      reminder_sent: false,
      session_url: 'https://beyond-the-breakdown.web.app/session?roomId='+id,
      wrapup_sent: false,
      id: id
    };
    slots.push(s);
    db.collection('sessions').doc(s.id).set(s, {merge: true});
  }
  console.log(slots);
  $('body').append(slots);
}


function makeid(length) {
  let result           = 'BTB-';
  let characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let charactersLength = characters.length;
  for ( let i = 0; i < length; i++ ) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}


