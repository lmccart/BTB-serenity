const app = firebase.app();
firebase.auth().signInAnonymously().catch(function(error) { console.log(error); });
firebase.auth().onAuthStateChanged(function(user) { });
const db = firebase.firestore(app);
let participantName = '';
let pass = window.location.href.includes('pass');

init();

function init() {
  const params = new URLSearchParams(window.location.search);
  sessionId = params.get('sessionId');
  if (!sessionId) {
    $('#error-notfound').show();
  } else {
    checkSession(sessionId)
    .then((data) => {
      $('#enter').attr('href', $('#enter').attr('href')+sessionId);
      console.log(data)
    })
    .catch((e) => {
      console.log(e);
      $('#error-notfound').show();
    });
  }
  $('#submit-welcome-name').on('click', showVideo);
  $('#session-enter').on('click', enterSession);
}

function checkSession(sessionId) {
  return new Promise((resolve, reject) => {
    if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)){
      $('#error-mobile').show();
    }
    db.collection('sessions').doc(sessionId).get({}).then((doc) => {
      if (doc.data()) resolve(doc.data());
      else reject();
    }).catch(reject);
  });
}

function showVideo() {
  participantName = $('#participant-name').val();
  if (participantName) {
    if (participantName.toLowerCase() === 'facilitator') {
      participantName = 'Serenity';
      pass = true;
    } else if (participantName.toLowerCase() === 'captioner') {
      participantName = 'Captioner';
      pass = true;
    }
    setCookie('userNameBTB', participantName, 1);
    $('#welcome-name').hide();
    $('#welcome-video').show();

    if (pass) {
      $('#session-enter').show();
    }
    setTimeout(() => {
      $('#session-enter').show();
    }, 110 * 1000);
    
  } else {
    alert('Please enter your display name');
  }
}

function enterSession() {
  window.location = 'https://build.beyondthebreakdown.world/'+sessionId;
}

function setCookie(cname, cvalue, exdays) {
  let d = new Date();
  d.setTime(d.getTime() + (exdays*24*60*60*1000));
  var expires = "expires="+ d.toUTCString();
  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/;domain=beyondthebreakdown.world";
  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/;";
}
