const app = firebase.app();
firebase.auth().signInAnonymously().catch(function(error) { console.log(error); });
firebase.auth().onAuthStateChanged(function(user) { });
const db = firebase.firestore(app);

init();

function init() {
  const params = new URLSearchParams(window.location.search);
  sessionId = params.get('sessionId');
  pid = params.get('pid');
  if (!sessionId) {
    $('#error').show();
  } else {
    checkSession(sessionId)
    .then((data) => {
      $('#enter').attr('href', $('#enter').attr('href')+sessionId);
      for (let p of data.participants) {
        console.log(p)
        if (p.pid === pid) {
          $('#welcome-name').text(' '+p.name);
        }
      }
    })
    .catch((e) => {
      console.log(e);
      $('#error').show();
    });
  }
}

function checkSession(sessionId) {
  return new Promise((resolve, reject) => {
    db.collection('sessions').doc(sessionId).get({}).then((doc) => {
      resolve(doc.data());
    }).catch(reject);
  });
}