const app = firebase.app();
firebase.auth().signInAnonymously().catch(function(error) { console.log(error); });
firebase.auth().onAuthStateChanged(function(user) { });
const db = firebase.firestore(app);
let participantName = '';


init();

function init() {
  const params = new URLSearchParams(window.location.search);
  sessionId = params.get('sessionId');
  if (!sessionId) {
    // $('#error').show();
  } else {
    checkSession(sessionId)
    .then((data) => {
      $('#enter').attr('href', $('#enter').attr('href')+sessionId);
      console.log(data)
    })
    .catch((e) => {
      console.log(e);
      $('#error').show();
    });
  }
  $('#submit-welcome-name').on('click', showVideo);
  $('#session-enter').on('click', enterSession);
}

function checkSession(sessionId) {
  return new Promise((resolve, reject) => {
    db.collection('sessions').doc(sessionId).get({}).then((doc) => {
      resolve(doc.data());
    }).catch(reject);
  });
}

function showVideo() {
  participantName = $('#participant-name').val();
  if (participantName) {
    $('#welcome-name').hide();
    $('#welcome-video').show();
    setTimeout(() => {
      $('#session-enter').show();
    }, 110 * 1000);
    
  } else {
    alert('Please enter your display name');
  }
}

function enterSession() {
  window.location = 'https://build.beyondthebreakdown.world/'+sessionId + '-' + participantName;
}