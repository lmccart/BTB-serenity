const app = firebase.app();
firebase.auth().signInAnonymously().catch(function(error) { console.log(error); });
firebase.auth().onAuthStateChanged(function(user) { });
const db = firebase.firestore(app);

let sessionId, pid;
let session;

$('#cancel-individual').on('click', cancelIndividual);
$('#cancel-group').on('click', cancelGroup);
parseParams();

function parseParams() {
  const params = new URLSearchParams(window.location.search);
  sessionId = params.get('sessionId');
  pid = params.get('pid');
  if (pid) pid = pid.split(',');
  console.log(sessionId, pid)

  if (!sessionId) {
    $('#not-found').show();
  } else {
    let docRef = db.collection('sessions').doc(sessionId);
    docRef.get().then(function(doc) {
      console.log(doc.data().participants)
      if (doc.exists && doc.data().participants.length) {
        session = doc.data();
        console.log(session);
        
        let people = '';
        for (let p of session.participants) {
          console.log(p.pid, p.name);
          if (!pid || !pid.length || pid.includes(p.pid)) {
            people += p.name + ', ';
          }
        }
        console.log(people)
        people = people.slice(0, -2);
        $('.cancel-people').text(people);

        if (!pid || !pid.length) {
          $('#cancel-group').show();
        } else if (pid.length === 1) {
          $('#cancel-individual').show();
        } else {
          $('#cancel-options').show();
        }

        $('.datetime').html(moment(session.datetime).format('dddd MMM DD h:mm a'));

      } else { $('#not-found').show(); }
    })//.catch(function(error) { $('#not-found').show(); });
  }
}

function cancelIndividual() {
  let updated_participants = [];
  for (let p of session.participants) {
    if (p.pid !== pid[0]) {
      updated_participants.push(p);
    }
  }
  db.collection('sessions').doc(sessionId).set({participants: updated_participants}, {merge: true});
  $('#cancel').hide();
  $('#confirm-individual').show();
}

function cancelGroup() {
  let updated_participants = [];
  for (let p of session.participants) {
    let found = false;
    for (let e of pid) {
      if (p.pid === e) {
        found = true;
      }
    }
    if (!found) updated_participants.push(p);
  }
  console.log(updated_participants)
  db.collection('sessions').doc(sessionId).set({participants: updated_participants, closed: false}, {merge: true});
  $('#cancel').hide();
  $('#confirm-group').show();
}
