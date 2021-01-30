const app = firebase.app();
let db;
let sessionId, pid;
let session;

firebase.auth().signInAnonymously()
.then(init)
.catch(function(error) { console.log(error); });


$('#submit-cancel-individual').on('click', cancelIndividual);
$('#submit-cancel-group').on('click', cancelGroup);
$('#submit-cancel-option').on('click', cancelOptions);
$('.cancel-option').on('click', function() {
  $('.cancel-option').removeClass('selected');
  $(this).addClass('selected');
  $('#submit-cancel-option').show();
});

function init() {
  db = firebase.firestore(app);
  const params = new URLSearchParams(window.location.search);
  sessionId = params.get('sessionId');
  pid = params.get('pid');
  if (pid) pid = pid.split(',');
  console.log(sessionId, pid)

  if (!sessionId || !pid || !pid.length) {
    $('#not-found').show();
  } else {
    let docRef = db.collection('sessions').doc(sessionId);
    docRef.get().then(function(doc) {
      console.log(doc.data().participants)
      if (doc.exists && doc.data().participants.length) {
        session = doc.data();
        console.log(session);
        
        let people = session.participants.filter(function(p, i) { return pid.includes(p.pid); }).map(function(p, i) { return p.name; }).join(', ');
        console.log(people)
        $('.cancel-people').text(people);
        $('.cancel-person').text(people.split(',')[0]);

        if (pid.includes('group') && pid.length > 2) {
          $('#cancel-group').show();
        } else if (pid.length === 1 || (pid.includes('group') && pid.length === 2)) {
          $('#cancel-individual').show();
        } else {
          $('#cancel-options').show();
        }

        $('.datetime').html(moment(session.datetime).format('dddd MMM DD h:mm a'));

      } else { $('#not-found').show(); }
    }).catch(function(error) { $('#not-found').show(); });
  }
}

function cancelIndividual() {
  cancel([pid[0]], true);
}

function cancelGroup() {
  cancel(pid, false);
}

function cancel(cancel_pids, is_individual) {
  let updated_participants = [];
  let canceled_participants = [];
  for (let p of session.participants) {
    let remove = false;
    for (let e of cancel_pids) {
      if (p.pid === e) {
        remove = true;
      }
    }
    if (!remove) updated_participants.push(p);
    else canceled_participants.push(p);
  }
  console.log(updated_participants, canceled_participants);
  db.collection('sessions').doc(sessionId).set({participants: updated_participants, closed: false}, {merge: true});

  let sendCancelFunc = firebase.functions().httpsCallable('sendCancel')
  sendCancelFunc({ datetime: session.datetime, participants: canceled_participants })
  .then(data => console.log(data))
  .catch(e => console.log(e));

  if (is_individual) {
    $('.cancel-options').hide();
    $('#confirm-individual').show();
  } else {
    $('.cancel-options').hide();
    $('#confirm-group').show();
  }
}


function cancelOptions() {
  if ($('.cancel-option.selected').data('type') === 'individual') {
    cancelIndividual();
  } else {
    cancelGroup();
  }
}
