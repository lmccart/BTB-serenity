const app = firebase.app();
firebase.auth().signInAnonymously().catch(function(error) { console.log(error); });
firebase.auth().onAuthStateChanged(function(user) { });
const db = firebase.firestore(app);

let db, api;
let userId;
let pauseTimer = 0;
let pauseInterval = false;
let ytPlayer;

/* GUIDE VARS */
let prompts = [];
let currentPrompt = -1;
let currentOption = 0;
let promptInterval = false;
let promptTimer = 0;


// Parse URL params, show HTML elements depending on view
const params = new URLSearchParams(window.location.search);
let sessionId = params.get('sessionId');
if (!sessionId) {
  $('#error').show(); // TODO show error page
}
let guide = params.get('guide') ? true : false;
if (guide) initGuide();

initSession();


function initSession() {
  // Create jitsi session
  const domain = 'meet.jit.si';
  const options = {
    roomName: sessionId,
    parentNode: document.querySelector('#meet'),
  };
  api = new JitsiMeetExternalAPI(domain, options);
  api.addListener('videoConferenceJoined', joined);

  // Setup listener for firestore changes
  let now = new Date().getTime();
  db.collection('messages').where('timestamp', '>', now).onSnapshot({}, function(snapshot) {
    snapshot.docChanges().forEach(function(change) {
      let msg = change.doc.data();
      if(change.type !== 'added') return;
      else if(msg.sessionId !== sessionId) return;
      else if (msg.type === 'pauseGroup') pauseGroup(msg.val);
      else if (msg.type === 'guide') playMessage(msg.val, true);
      else console.log('badType:', msg.type)
    });
  });

  var tag = document.createElement('script');
  tag.id = 'iframe-demo';
  tag.src = 'https://www.youtube.com/iframe_api';
  var firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  
  $('#pause-group').on('click', triggerPauseGroup);
}

function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('ytPlayer', {
    videoId: 't0NHILIwO2I',
    playerVars: { 'autoplay': 0, 'controls': 0, 'rel' : 0,  'fs' : 0, 'modestbranding': 1  }
  });
}


// Called when participant joins.
function joined(e) {
  userId = e.id;
  $('#participant-controls').show();
}


function sendMessage(type, val) {
  let m = { type: type, sessionId: sessionId, val: val, timestamp: new Date().getTime() };
  db.collection('messages').add(m);
}

function triggerPauseGroup() {
  if (guide) pausePrompt();
  sendMessage('pauseGroup', 10000); // 10 second pause
}

function triggerTextPrompt(e) {
  const msg = $('#prompt-text').val();
  if (msg) sendMessage('guide', msg);
  $('#prompt-text').val('');
}

function triggerPrompt() {
  sendMessage('guide', prompts[currentPrompt].options[currentOption]);
}

function pauseGroup(ms) {
  if (pauseInterval) clearInterval(pauseInterval);
  pauseTimer = performance.now() + ms;
  $('#pause-timer').text(msToHms(ms));
  $('#overlay').fadeIn(0).delay(ms).fadeOut(0);
  ytPlayer.playVideo();
  api.isAudioMuted().then(muted => {
    if (!muted) api.executeCommand('toggleAudio');
  });
  setTimeout(function() {
    api.executeCommand('toggleAudio');
    ytPlayer.stopVideo();
    if (guide && currentPrompt > -1) resumePrompt();
  }, ms);
  pauseInterval = setInterval(function() { 
    const remaining = pauseTimer - performance.now();
    $('#pause-timer').text(msToHms(remaining));
  });
}

function playMessage(msg, doSpeak) {
  $('#notif').text(msg);
  $('#notif-holder').stop().fadeIn(300).delay(4000).fadeOut(300);
  if (doSpeak) speak(msg);
  console.log('playMessage: ' + msg);
}

// Speaks a message in the browser via TTS.
function speak(msg) {
  const utter = new SpeechSynthesisUtterance(msg);
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}


/* GUIDE */
function initGuide() {
  $.ajax('/data/prompts.tsv')
  .done(data => {
    console.log('loaded prompts from TSV');
    convertTsvIntoObjects(data);

    $('#guide-controls').show();
    $('#trigger-prompt').on('click', triggerTextPrompt);
    $('#start-prompt').on('click', startPrompt);
    $('#skip-prompt').on('click', nextPrompt);
    $('#pause-prompt').on('click', pausePrompt);
    $('#resume-prompt').on('click', resumePrompt);
    $('#world-submit').on('click', submitWorld);

  });  
}

function startPrompt() {
  $('#start-prompt').hide();
  $('#next').show();
  $('#pause-prompt').show();
  $('#skip-prompt').show();
  nextPrompt();
}

function nextPrompt() {
  if (promptInterval) clearInterval(promptInterval);
  currentPrompt++;
  if (currentPrompt < prompts.length) {
    promptInterval = setInterval(checkPrompt, 100);
    promptTimer = prompts[currentPrompt].lastOffset + performance.now();
    let options = prompts[currentPrompt].options;
    currentOption = Math.floor(Math.random() * options.length);
    $('#next-prompt').text(options[currentOption]);
  } else {
    $('#next').hide();
    $('#form').show();
  }
}

function resumePrompt(){
  if (pauseInterval) clearInterval(pauseInterval);
  promptTimer += performance.now();
  promptInterval = setInterval(checkPrompt, 100);
  $('#resume-prompt').hide();
  $('#pause-prompt').show();
}

function pausePrompt() {
  if (promptInterval) clearInterval(promptInterval);
  promptTimer -= performance.now();
  $('#pause-prompt').hide();
  $('#resume-prompt').show();
  $('#next-timer').text('Next prompt PAUSED');
}

function checkPrompt() {
  const remaining = promptTimer - performance.now();
  if (remaining <= 0) {
    triggerPrompt();
    nextPrompt();
  } else {
    $('#next-timer').text('Next prompt in '+msToHms(remaining));
  }
}

function submitWorld() {
  let w = {
    world_name: $('#world-name').val(),
    world_values: $('#world-values').val(),
    world_description: $('#world-description').val()
  }
  // check complete
  for (let i in w) {
    if (!w[i] || !w[i].length) {
      alert('please complete the form');
      return false;
    }
  }
  db.collection('sessions').doc(sessionId).set(w, {merge: true});
}

function convertTsvIntoObjects(tsvText){
  let tsvRows = tsvText.split('\n');
  let headers = tsvRows.shift();
  headers = headers.split('\t');

  let lastOffset = 0;
  for (let row of tsvRows) {
    let cols = row.split('\t');
    if (cols[1].toUpperCase().includes('Y')) {
      let offset = offsetToMs(cols[0]);
      let p = {
        offset: offset,
        lastOffset: offset - lastOffset,
        options: []
      };
      for (let i=2; i<cols.length; i++) {
        if (cols[i].length > 2) p.options.push(cols[i]);
      }
      lastOffset = offset;
      prompts.push(p);
    }
  }
  console.log(prompts);
}

// Helper function for formatting text in hh:mm format.
function msToHms(d) {
  d = Number(d) / 1000;
  let h = Math.floor(d / 3600);
  let m = Math.floor(d % 3600 / 60);
  let s = Math.floor(d % 3600 % 60);

  let time =  String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  if (h > 0) time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return time;
}

function offsetToMs(offset) {
  const minSec = offset.split(':');
  return 1000 * (parseInt(minSec[1]) + parseInt(minSec[0]) * 60);
}

