const app = firebase.app();
let db;
let initialized = false;
firebase.auth().signInAnonymously().catch(function(error) { console.log(error); });
firebase.auth().onAuthStateChanged(function(user) { 
  db = firebase.firestore(app);

  db.collection('sessions').onSnapshot({}, function(snapshot) {
    console.log('snap')
    snapshot.docChanges().forEach(function(change) {
      options[change.doc.id] = change.doc.data();
      if (!initialized) showIntro();
    });
  });
});


let num = 3;
let caption = false;
let asl = false;

let options = {};
let selected_option = -1;
let timer_interval;
let end_timer;

showConfirm();
initialized = true;

$('#intro').on('click', showSessionOptions);

$('#submit-search').on('click', showSessions);
$('#back-intro').on('click', showIntro);


$('#submit-session').on('click', selectSession);
$('#back-sessionOptions').on('click', showSessionOptions);

$('#submit-register').on('click', register);
$('#back-sessions').on('click', showSessionOptions);

$('#caption-display').on('click', () => { $('#caption').prop('checked', !$('#caption').prop('checked'))});
$('#asl-display').on('click', () => { $('#asl').prop('checked', !$('#asl').prop('checked'))});

function showIntro() {
  $('section').hide();
  $('#intro').show();
  initialized = true;
}

function showSessionOptions() {
  $('section').hide();
  $('#sessionOptions').show();
  releaseSession();
}

function showSessions() {
  $('section').hide();
  $('#sessions-options').empty();
  $('.notif').hide();
  $('#sessions').show();
  $('#submit-session').hide();
  searchSessions();
}

function showParticipantForm() {
  $('section').hide();
  $('#participants').show();
  $('#participants-info').empty();
  for (let n=1; n<num+1; n++) {
    $('#participants-info').append('<div class="participant-item"><label for="p'+n+'name">Participant '+n+' Name</label></td><td><input id="p'+n+'name" type="text"></div>');
    $('#participants-info').append('<div class="participant-item"><label for="p'+n+'email" type="email">Participant '+n+' Email</label></td><td><input id="p'+n+'email" type="text"></div>');
  }
}

function showConfirm() {
  $('section').hide();
  $('#confirm').show();
}

function searchSessions() {
  releaseSession();
  num = Number($('#num').val());

  caption = $('#caption').prop('checked');
  asl = $('#asl').prop('checked');

  for (let o in options) {
    let opt = options[o];
    if (opt.participants.length + num <= 6 && !opt.hold) {
      if ((!caption && !asl) || opt.accessible) {
        let date = moment(opt.datetime).format('dddd MMM DD h:mm a');
        console.log(date)
        let elt = $('<li class="option button">'+date+'</li>');
        elt.attr('id', opt.id);
        $('#sessions-options').append(elt);
      }
    }
  }
  $('.option').on('click', function() {
    $('.option').removeClass('selected');
    $(this).addClass('selected');
    $('#submit-session').show();
  });

  if (!$('.option').length) {
    $('#sessions-none').show();
  }
}


function selectSession() {
  $('#sessions').hide();
  releaseSession();
  selected_option = $('.option.selected').attr('id');

  if (options[selected_option].hold) {
    alert('Sorry this session is no longer available, please search again.');
    // showSessionOptions();
  } else {
    startTimer();
    // set hold
    db.collection('sessions').doc(selected_option).set({hold: new Date().getTime()}, {merge: true});
    showParticipantForm(num);
  }
}

// TODO: validate email format
function validateParticipantForm() {
  let success = true;
  $('input').each(function() {
    if ($(this).val() === '') {
      success = false;
    }
  });
  return success;
}

function register(e) {
  e.preventDefault(); 
  if (validateParticipantForm()) {
    
    let s = options[selected_option];
    s.hold = false;

    let group_ids = [];
    for (let i=0; i<num; i++) {
      group_ids.push(makeid());
    }

    for (let i=1; i<num+1; i++) {
      let pid = [group_ids[i-1]];
      for (let j=0; j<num; j++) {
        if (j !== i-1) {
          pid.push(group_ids[j]);
        }
      }
      let url_cancel = 'https://beyondthebreakdown.world/cancel/?sessionId='+s.id+'&pid='+pid.join(',');
      let url_session = 'https://beyondthebreakdown.world/welcome/?sessionId='+s.id+'&pid='+pid[0];

      s.participants.push({
        name: $('#p'+i+'name').val(),
        email: $('#p'+i+'email').val(),
        pid: pid[0],
        url_session: url_session,
        url_cancel: url_cancel
      });
    };
    if (num >= 4) {
      s.closed = true;
    }

    if (caption) s.accessiblity_caption = true;
    if (asl) s.accessiblity_asl = true;

    db.collection('sessions').doc(selected_option).set(s);
    displayRegistrationConfirmation();
  } else {
    alert('Please fill out all participant contact info.');
  }
}

function displayRegistrationConfirmation() {
  $('#sessionOptions').hide();
  $('#sessions').hide();
  $('#participants').hide();
  $('#confirm-date').text(options[selected_option].datetime);
  $('#confirm-time').text(options[selected_option].datetime);
  $('#confirm-url').text(options[selected_option].url_session);
  $('#confirm').show();
  releaseSession();
}

function releaseSession() {
  $('.option').removeClass('selected-option');
  if (selected_option !== -1) {
    options[selected_option].hold = false;
    db.collection('sessions').doc(selected_option).set({hold: false}, {merge: true});
    selected_option = -1;
  }
  if (timer_interval) clearInterval(timer_interval);
  $('#reset').hide();
}

// Timer helper functions
function startTimer() {
  if (timer_interval) clearInterval(timer_interval);
  let amt = 2 * 60 * 1000;
  end_timer = performance.now() + amt;
  $('#timer').text(msToHms(amt));
  $('#reset').show();

  timer_interval = setInterval(function() { 
    const remaining = end_timer - performance.now();
    if (remaining <= 0) {
      $('#reset-timer').text(msToHms(0));
      db.collection('sessions').doc(selected_option).set({hold: false}, {merge: true});
      showSessionOptions();
    } else {
      $('#reset-timer').text(msToHms(remaining));
    }
  }, 100);
}

function msToHms(d) {
  d = Number(d) / 1000;
  let h = Math.floor(d / 3600);
  let m = Math.floor(d % 3600 / 60);
  let s = Math.floor(d % 3600 % 60);

  let time =  String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  if (h > 0) time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return time;
}


function makeid() {
  let result           = new Date().getMilliseconds();
  let characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let charactersLength = characters.length;
  for ( let i = 0; i < 6; i++ ) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}


