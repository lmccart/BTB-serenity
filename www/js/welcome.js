const app = firebase.app();
let db;
let participantName = '';
let pass = window.location.href.includes('pass');
firebase.auth().signInAnonymously()
.then(init)
.catch(function(error) { console.log(error); });



function init() {
  db = firebase.firestore(app);
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
  // e.preventDefault();
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
    $('#session-enter').show();

    // if (pass) {
    //   $('#session-enter').show();
    // }
    // setTimeout(() => {
    // }, 30 * 1000);
    
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
