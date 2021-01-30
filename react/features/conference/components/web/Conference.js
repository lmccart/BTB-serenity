// @flow

import _ from 'lodash';
import React from 'react';

import VideoLayout from '../../../../../modules/UI/videolayout/VideoLayout';
import { getConferenceNameForTitle } from '../../../base/conference';
import { connect, disconnect } from '../../../base/connection';
import { translate } from '../../../base/i18n';
import { connect as reactReduxConnect } from '../../../base/redux';
import { Chat } from '../../../chat';
import { Filmstrip } from '../../../filmstrip';
import { CalleeInfoContainer } from '../../../invite';
import { LargeVideo } from '../../../large-video';
import { KnockingParticipantList, LobbyScreen } from '../../../lobby';
import { Prejoin, isPrejoinPageVisible } from '../../../prejoin';
import { fullScreenChanged, showToolbox } from '../../../toolbox/actions.web';
import { Toolbox } from '../../../toolbox/components/web';
import { LAYOUTS, getCurrentLayout } from '../../../video-layout';
import { maybeShowSuboptimalExperienceNotification } from '../../functions';
import {
    AbstractConference,
    abstractMapStateToProps
} from '../AbstractConference';
import type { AbstractProps } from '../AbstractConference';

import Labels from './Labels';
import { default as Notice } from './Notice';

import config from '../../../../../static/data/env.json';
import { Player, ControlBar } from 'video-react';

declare var APP: Object;
declare var interfaceConfig: Object;

let sessionId;
let userName;
let db;
let pauseTimer = 0;
let pauseInterval = false;
let serenityVoice;
let serenityVoiceIndex = 99999;

/* FACILITATOR VARS */
let facilitator;
let prompts = [];
let extraPrompts = [];
let currentPrompt = -1;
let currentOption = 0;
let promptInterval = false;
let promptTimer = 0;

/**
 * DOM events for when full screen mode has changed. Different browsers need
 * different vendor prefixes.
 *
 * @private
 * @type {Array<string>}
 */
const FULL_SCREEN_EVENTS = [
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'fullscreenchange'
];

/**
 * The CSS class to apply to the root element of the conference so CSS can
 * modify the app layout.
 *
 * @private
 * @type {Object}
 */
const LAYOUT_CLASSNAMES = {
    [LAYOUTS.HORIZONTAL_FILMSTRIP_VIEW]: 'horizontal-filmstrip',
    [LAYOUTS.TILE_VIEW]: 'tile-view',
    [LAYOUTS.VERTICAL_FILMSTRIP_VIEW]: 'vertical-filmstrip'
};

/**
 * The type of the React {@code Component} props of {@link Conference}.
 */
type Props = AbstractProps & {

    /**
     * Whether the local participant is recording the conference.
     */
    _iAmRecorder: boolean,

    /**
     * Returns true if the 'lobby screen' is visible.
     */
    _isLobbyScreenVisible: boolean,

    /**
     * The CSS class to apply to the root of {@link Conference} to modify the
     * application layout.
     */
    _layoutClassName: string,

    /**
     * Name for this conference room.
     */
    _roomName: string,

    /**
     * If prejoin page is visible or not.
     */
    _showPrejoin: boolean,

    dispatch: Function,
    t: Function
}

/**
 * The conference page of the Web application.
 */
class Conference extends AbstractConference<Props, *> {
    _onFullScreenChange: Function;
    _onShowToolbar: Function;
    _originalOnShowToolbar: Function;

    /**
     * Initializes a new Conference instance.
     *
     * @param {Object} props - The read-only properties with which the new
     * instance is to be initialized.
     */
    constructor(props) {
        super(props);

        // Throttle and bind this component's mousemove handler to prevent it
        // from firing too often.
        this._originalOnShowToolbar = this._onShowToolbar;
        this._onShowToolbar = _.throttle(
            () => this._originalOnShowToolbar(),
            100,
            {
                leading: true,
                trailing: false
            });

        // Bind event handler so it is only bound once for every instance.
        this._onFullScreenChange = this._onFullScreenChange.bind(this);
    }

    /**
     * Start the connection and get the UI ready for the conference.
     *
     * @inheritdoc
     */
    componentDidMount() {
        document.title = `Beyond the Breakdown`;
        let headTitle = document.querySelector('head');
        let setFavicon = document.createElement('link');
        setFavicon.setAttribute('rel','shortcut icon');
        setFavicon.setAttribute('href','/favicon.ico');
        headTitle.appendChild(setFavicon);
        $('<link/>', { rel: 'stylesheet', type: 'text/css', href: 'https://use.typekit.net/fth5afb.css' }).appendTo('head');
        $('<link/>', { rel: 'stylesheet', type: 'text/css', href: 'static/style.css' }).appendTo('head');
        this._start();
    }

    /**
     * Calls into legacy UI to update the application layout, if necessary.
     *
     * @inheritdoc
     * returns {void}
     */
    componentDidUpdate(prevProps) {
        if (this.props._shouldDisplayTileView
            === prevProps._shouldDisplayTileView) {
            return;
        }

        // TODO: For now VideoLayout is being called as LargeVideo and Filmstrip
        // sizing logic is still handled outside of React. Once all components
        // are in react they should calculate size on their own as much as
        // possible and pass down sizings.
        VideoLayout.refreshLayout();
    }

    /**
     * Disconnect from the conference when component will be
     * unmounted.
     *
     * @inheritdoc
     */
    componentWillUnmount() {
        APP.UI.unbindEvents();

        FULL_SCREEN_EVENTS.forEach(name =>
            document.removeEventListener(name, this._onFullScreenChange));

        APP.conference.isJoined() && this.props.dispatch(disconnect());
    }

    /**
     * Implements React's {@link Component#render()}.
     *
     * @inheritdoc
     * @returns {ReactElement}
     */
    render() {
        const {
            _iAmRecorder,
            _isLobbyScreenVisible,
            _layoutClassName,
            _showPrejoin
        } = this.props;
        const hideLabels = _iAmRecorder;

        return (
        <>
            <div id='gradient'></div>
            <div
                className = { _layoutClassName }
                id = 'videoconference_page'
                onMouseMove = { this._onShowToolbar }>

                <main id='session-page'>
                    <section id='session-top'>

                    </section>
                    <section id='session-bottom'>
                        <div id='participant-controls' style={{display:'none'}}>
                            <h2 className='sr-only'>Participant Controls</h2>
                            <div id='group-buttons'>
                                <button id='group-help' onClick={this._triggerHelp}>Help</button>
                                <button id='group-pause' onClick={this._triggerGroupPause}>Pause</button>
                                <button id='toggle-chat' onClick={this._toggleChat}>Chat</button>
                            </div>
                        </div>

                    </section>
                    <section id='group-pause-overlay' style={{display:'none'}}>
                        <Player
                            src='./images/pause.mp4'
                            loop
                            id='group-pause-player' 
                            ref={(player) => { this.player = player }}>
                            <ControlBar disableCompletely={true} />
                        </Player>
                        <div id='group-pause-timer'></div>
                    </section>
                    <section id='notif-holder'>
                        <div id='notif'></div>
                    </section>

                    <section id='group-chat' style={{display:'none'}} className='panel'>
                        <img id='close-chat' onClick={this._toggleChat} src='./images/x.png' />
                        <h3 className='sr-only'>Chat</h3>
                        <div id='serenity-latest' className='chat-message serenity-message'>
                            <span className='chat-user'>Serenity</span>
                            <span className='chat-text'>Welcome</span>
                        </div>
                        <div id='chat-messages'>
                            <div id='chat-messages-holder'></div>
                        </div>
                        <label htmlFor='chat-text' className='sr-only'>Input Message</label>
                        <input type='text' id='chat-text' placeholder='Type a message' className='panel-input'/>
                        <button id='chat-send' onClick={this._sendChat} className='sr-only'>Send</button>
                    </section>

                    <section id='facilitator-controls' style={{display:'none'}} aria-hidden='true' className='panel'>
                        <div id='session-controls'>
                            <button id='start-prompt' className='facilitator-button' onClick={this._startPrompt}>Start Prompts</button>
                            <button id='end-session' className='facilitator-button' onClick={this._triggerEndSession} style={{display:'none'}}>End Session</button>

                            <div id='next' style={{display:'none'}}>
                                <div id='next-timer'></div>
                                <div id='next-prompt'></div>
                            </div>

                            <button id='pause-prompt' className='facilitator-button light' style={{display:'none'}} onClick={this._pausePrompt}>Pause</button>
                            <button id='resume-prompt' className='facilitator-button light' style={{display:'none'}} onClick={this._resumePrompt}>Resume</button>
                            <button id='skip-prompt' className='facilitator-button light' style={{display:'none'}} onClick={this._nextPrompt}>Skip</button>
                            <button id='play-prompt' className='facilitator-button light' style={{display:'none'}} onClick={this._nowPrompt}>Play Now</button>
                            <input id='prompt-text' type='text' placeholder='Type a message'  className='panel-input'/>
                        </div>

                        <div id='world-form' style={{display:'none'}}>
                            <label htmlFor='world-name'>World name</label>
                            <textarea id='world-name' type='text' className='panel-input'></textarea>
                            <label htmlFor='world-values'>World values</label>
                            <textarea id='world-values' type='text' className='panel-input'></textarea>
                            <label htmlFor='world-actions'>World actions</label>
                            <textarea id='world-actions' type='text' className='panel-input'></textarea>
                            <button id='world-submit' onClick={this._submitWorld}>Submit</button>
                        </div>
                        <div id='world-thanks' className='chat-message serenity-message' style={{display:'none'}}>Thanks! The session is complete, you can close the window now.</div>
                    </section>


                </main>
                {/* <div id='error' style={{display:'none'}}><span>Sorry! I'm unable to locate your session. Please try clicking the link in your email again.</span></div> */}

                
                <audio id='audio-intro' style={{display:'none'}} loop>
                    <source src='./images/intro.mp3'></source>
                </audio>
                <audio id='audio-outro' style={{display:'none'}}>
                    <source src='./images/outro.mp3'></source>
                </audio>
                    
                <div id = 'videospace'>
                    <LargeVideo />
                    <KnockingParticipantList />
                    <Filmstrip />
                    { hideLabels || <Labels /> }
                </div>

                <Notice />
                { _showPrejoin || _isLobbyScreenVisible || <Toolbox /> }
                <Chat />

                { this.renderNotificationsContainer() }

                <CalleeInfoContainer />

                { _showPrejoin && <Prejoin />}
                
                <img src='./images/serenity.gif' id='serenity-session' alt=''/>
            </div>
        </>
        );
    }

    /**
     * Updates the Redux state when full screen mode has been enabled or
     * disabled.
     *
     * @private
     * @returns {void}
     */
    _onFullScreenChange() {
        this.props.dispatch(fullScreenChanged(APP.UI.isFullScreen()));
    }

    /**
     * Displays the toolbar.
     *
     * @private
     * @returns {void}
     */
    _onShowToolbar() {
        this.props.dispatch(showToolbox());
    }


    /* BTB SERENITY!! */
    _initFirebase = () => {
        return new Promise(resolve => {
            console.log(config.firebaseApiKey)
            const firebaseConfig = {
                apiKey: config.firebaseApiKey,
                authDomain: "beyond-the-breakdown.firebaseapp.com",
                databaseURL: "https://beyond-the-breakdown.firebaseio.com",
                projectId: "beyond-the-breakdown",
                storageBucket: "beyond-the-breakdown.appspot.com",
                messagingSenderId: "516765643646",
                appId: "1:516765643646:web:3c2001a0fdf413c457392f",
                measurementId: "G-95RNYT6BL4"
            };

            this._loadFirebase(firebaseConfig)
            .then(firebase => {
                return this._loadAuth();
            })
            .then(firebase => {
                return firebase.auth().signInAnonymously();
            })
            .then(firebase => {
                return this._loadFirestore();
            })
            .then(firebase => {
                db = firebase.firestore();
                console.log('done')
                console.log(db);
                resolve();
            });
    })};
    
    _loadFirebase = (config) => { 
        return new Promise( (resolve, reject) => {
            document.body.appendChild(Object.assign(document.createElement('script'), {
                src: `https://www.gstatic.com/firebasejs/8.2.4/firebase-app.js`,
                onload: () => resolve(firebase.initializeApp(config)),
                onerror: reject
            }));
    })};
    _loadAuth = () => { 
        return new Promise( (resolve, reject) => {
            document.body.appendChild(Object.assign(document.createElement('script'), {
                src: `https://www.gstatic.com/firebasejs/8.2.4/firebase-auth.js`,
                onload: () => resolve(firebase),
                onerror: reject
            }));
    })};
    _loadFirestore = () => { 
        return new Promise( (resolve, reject) => {
            document.body.appendChild(Object.assign(document.createElement('script'), {
                src: `https://www.gstatic.com/firebasejs/8.2.4/firebase-firestore.js`,
                onload: () => resolve(firebase),
                onerror: reject
            }));
    })};
  
    _initSession = () => {
        console.log('LM _initSession')
        if (facilitator) this._initFacilitator();

        $.ajax(`${window.location.origin}/static/data/extra-prompts.txt`)
            .done(data => {
                extraPrompts = data.split('\n').filter(Boolean);
                console.log(extraPrompts);
            });

        $('#participant-controls').show();
        $('#chat-text').on('keypress', (e) => { if (e.which === 13) this._sendChat();});
        $('#prompt-text').on('keypress', (e) => { if (e.which === 13) this._triggerTextPrompt();});
        window.dispatchEvent(new Event('resize'));

        let introEl = document.querySelector('#audio-intro');
        introEl.volume = 0.03;
        introEl.play();

        let now = new Date().getTime();
        db.collection('messages').where('timestamp', '>', now).onSnapshot({}, (snapshot) => {
            let that = this;
            snapshot.docChanges().forEach(function(change) {
                let msg = change.doc.data();
                console.log(msg)
                if (change.type !== 'added') return;
                else if (msg.sessionId !== sessionId) return;
                else if (msg.type === 'stop-intro') that._stopIntroMusic();
                else if (msg.type === 'group-pause') that._groupPause(msg.val);
                else if (msg.type === 'group-chat') that._groupChatMessage(msg.val);
                else if (msg.type === 'serenity') that._playPrompt(msg.val, true);
                else if (msg.type === 'end-session') that._endSession();
                else console.log('LM badType:', msg.type)
            });
        });

    }

    _sendMessage = (type, val) => {
        let m = {
            type: type,
            sessionId: sessionId,
            val: val,
            timestamp: new Date().getTime()
        };
        db.collection('messages').add(m);
    };

    _stopIntroMusic = () => {
        let introEl = document.querySelector('#audio-intro');
        introEl.pause();
    }

    _sendChat = () => {
        const data = {
            msg: $('#chat-text').val(),
            userName: userName 
        }
        if (data.msg) this._sendMessage('group-chat', data);
        $('#chat-text').val('');
    }

    _groupChatMessage = (data) => {
        let msg = data.msg;
        if (msg.includes('http')) {
            msg = '<a href="'+msg+'" target="_blank">'+msg+'</a>';
        } else if (msg.includes('.com') || msg.includes('.org') || msg.includes('.net')) {
            msg = '<a href="http://'+msg+'" target="_blank">'+msg+'</a>';
        }
        if (data.userName !== 'Serenity') {
            let elt = $('<div class="chat-message"><span class="chat-user">'+data.userName+'</span><span class="chat-text">'+msg+'</span></div>');
            $('#chat-messages-holder').append(elt);
            $('#chat-messages').scrollTop($('#chat-messages-holder').height());
        } else {
            $('#serenity-latest .chat-text').html(msg);
        }
    }
  
    _triggerHelp = () => {
        let randomPrompt = extraPrompts[Math.floor(Math.random() * extraPrompts.length)];
        this._sendMessage('serenity', randomPrompt);
    }
    _triggerGroupPause = () => {
        if (facilitator) this._pausePrompt();
        this._sendMessage('group-pause', 20 * 1000); // 20 second pause
    }

    _toggleChat = () => {
        $('#group-chat').toggle();
        $('#chat-messages').scrollTop($('#chat-messages-holder').height());
    }
  
    _groupPause = (ms) => {
        if (pauseInterval) clearInterval(pauseInterval);
        pauseTimer = performance.now() + ms;
        $('#group-pause-timer').text(_msToHms(ms));
        $('#group-pause-overlay').fadeIn(0).delay(ms).fadeOut(0);
        this.player.play();
        APP.UI.mute(true);
        let player = this.player;
        pauseInterval = setInterval(function() {
            const remaining = pauseTimer - performance.now();
            $('#group-pause-timer').text(_msToHms(remaining));
        });
        setTimeout(function() {
            if (!facilitator) APP.UI.mute(false);
            player.pause();
            clearInterval(pauseInterval);
            if (currentPrompt > -1) this._resumePrompt();
        }, ms);
    }
  
    _playPrompt = (msg, doSpeak) => {
        this._stopIntroMusic();
        $('#notif').text(msg);
        this._groupChatMessage({msg: msg, userName: 'Serenity'});
        let msgDur = Math.max(msg.length*75, 1000);
        $('#notif-holder').stop().fadeIn(300).delay(msgDur).fadeOut(300);
        if (doSpeak) this._speak(msg);
        console.log('LM _playPrompt: ' + msg);
    }
  
    // Speaks a message in the browser via TTS.
    _speak = (msg) => {
        const utter = new SpeechSynthesisUtterance(msg);
        utter.rate = 0.9;
        if (serenityVoice) utter.voice = serenityVoice;
        window.speechSynthesis.speak(utter);
    }
  
    /* FACILITATOR */
    _initFacilitator = () => {
        console.log('LM init')

        $.ajax(`${window.location.origin}/static/data/prompts.tsv`)
            .done(data => {
                console.log('LM loaded prompts from TSV');
                this._convertTsvIntoObjects(data);
                $('#facilitator-controls').show();
                $('#group-help').hide();
            });
    }
  
    _startPrompt = () => {
        if (!facilitator) return;
        this._sendMessage('stop-intro', {});
        $('#start-prompt').hide();
        $('#next').show();
        $('#pause-prompt').show();
        $('#play-prompt').show();
        $('#skip-prompt').show();
        $('#end-session').show();
        this._nextPrompt();
    }
  
    _nextPrompt = () => {
        if (!facilitator) return;
        if (promptInterval) clearInterval(promptInterval);
        currentPrompt++;
        console.log(currentPrompt, prompts.length);
        if (currentPrompt < prompts.length) {
            $('#resume-prompt').hide();
            $('#pause-prompt').show();
            promptInterval = setInterval(this._checkPrompt, 100);
            promptTimer = prompts[currentPrompt].lastOffset + performance.now();
            let options = prompts[currentPrompt].options;
            currentOption = Math.floor(Math.random() * options.length);
            $('#next-prompt').text(options[currentOption]);
        } else {
            $('#next').hide();
            $('#pause-prompt').hide();
            $('#resume-prompt').hide();
            $('#play-prompt').hide();
            $('#skip-prompt').hide();
        }
    }

    _nowPrompt = () => {
        if (!facilitator) return;
        $('#resume-prompt').hide();
        $('#pause-prompt').show();
        this._triggerPrompt();
        this._nextPrompt();
    }
  
    _resumePrompt = () => {
        if (!facilitator) return;
        if (pauseInterval) clearInterval(pauseInterval);
        promptTimer += performance.now();
        promptInterval = setInterval(this._checkPrompt, 100);
        $('#resume-prompt').hide();
        $('#pause-prompt').show();
    }
  
    _pausePrompt = () => {
        if (!facilitator || currentPrompt === -1) return;
        if (promptInterval) clearInterval(promptInterval);
        promptTimer -= performance.now();
        $('#pause-prompt').hide();
        $('#resume-prompt').show();
        $('#next-timer').text('Next prompt PAUSED');
    }
  
    _checkPrompt = () => {
        const remaining = promptTimer - performance.now();
        if (remaining <= 0) {
            this._triggerPrompt();
            this._nextPrompt();
        } else {
            $('#next-timer').text('Next prompt in ' + _msToHms(remaining));
        }
    }
  
    _triggerPrompt = () => {
        this._sendMessage('serenity', prompts[currentPrompt].options[currentOption]);
    }
    
    _triggerTextPrompt = () => {
        console.log('LM triggerTextPrompt');
        const msg = $('#prompt-text').val();
        if (msg) this._sendMessage('serenity', msg);
        $('#prompt-text').val('');
    };

    _triggerEndSession = () => {
        let r = confirm('Careful! Are you sure you want to end this session for everyone?');
        if (r) {
            this._sendMessage('end-session', {});
        }
    }
  
    _endSession = () => {
        console.log('end session')
        let audioDur = 33 * 1000;
        let outroEl = document.querySelector('#audio-outro');
        outroEl.play();
        APP.UI.mute(true);
        if (!facilitator) {
            $('#videoconference_page').delay(0).fadeOut(audioDur);
            setTimeout(function() {
                window.location = 'https://beyondthebreakdown.world/credits';
            }, audioDur);
        } else {
            $('#session-controls').hide();
            $('#world-form').show();
            $('#facilitator-controls').width('50vw');
        }
    }

    _submitWorld = () => {
        let w = {
            world_values: $('#world-values').val(),
            world_actions: $('#world-actions').val()
        }
        // check complete
        for (let i in w) {
            if (!w[i] || !w[i].length) {
                alert('Please complete the form');
                return false;
            }
        }
        db.collection('sessions').doc(sessionId).set(w, {
            merge: true
        });

        $('#world-form').hide();
        $('#world-thanks').show();
    }
  
    _convertTsvIntoObjects = (tsvText) => {
        let tsvRows = tsvText.split('\n');
        let headers = tsvRows.shift();
        headers = headers.split('\t');
  
        let lastOffset = 0;
        for (let row of tsvRows) {
            let cols = row.split('\t');
            if (cols[1].toUpperCase().includes('Y')) {
                const minSec = cols[0].split(':');
                let offset = 1000 * (parseInt(minSec[1]) + parseInt(minSec[0]) * 60); // offset to ms
                let p = {
                    offset: offset,
                    lastOffset: offset - lastOffset,
                    options: []
                };
                for (let i = 2; i < cols.length; i++) {
                    if (cols[i].length > 2) p.options.push(cols[i]);
                }
                lastOffset = offset;
                prompts.push(p);
            }
        }
        console.log(prompts);
    }

    /**
     * Until we don't rewrite UI using react components
     * we use UI.start from old app. Also method translates
     * component right after it has been mounted.
     *
     * @inheritdoc
     */
    _start() {
        APP.UI.start();
        APP.UI.registerListeners();
        APP.UI.bindEvents();

        FULL_SCREEN_EVENTS.forEach(name =>
            document.addEventListener(name, this._onFullScreenChange));

        const { dispatch, t } = this.props;
        dispatch(connect());
        maybeShowSuboptimalExperienceNotification(dispatch, t);

        sessionId = window.location.pathname.substring(1);
        
        userName = _getCookie('userNameBTB') || 'Participant';
        if (userName === 'Serenity') {
            facilitator = true;
            APP.UI.muteVideo(true);
            APP.UI.mute(true);
        } else {
            APP.UI.muteVideo(false);
            APP.UI.mute(false);
        }
        APP.conference.changeLocalDisplayName(userName);
        console.log('LM ' + sessionId + ' ' + userName + ' ' + facilitator);

        window.speechSynthesis.onvoiceschanged = function() {
            let voiceOptions = ['Ava', 'Allison', 'Susan', 'Samantha', 'Vicki', 'Kathy', 'Victoria', 'Vicki'];
            let voices = window.speechSynthesis.getVoices();
            for (let v in voices) {
                console.log(voices[v]);
                let ind = voiceOptions.indexOf(voices[v].voiceURI);
                if (ind !== -1 && ind < serenityVoiceIndex) {
                    serenityVoice = voices[v];
                    serenityVoiceIndex = ind;
                    console.log('found! '+voices[v]);
                }
            }
        };

        this._initFirebase()
        .then(this._initSession);
    }
    
}

function _getCookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for(var i = 0; i <ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
      }
    }
    return "";
}

/**
 * Maps (parts of) the Redux state to the associated props for the
 * {@code Conference} component.
 *
 * @param {Object} state - The Redux state.
 * @private
 * @returns {Props}
 */
function _mapStateToProps(state) {
    return {
        ...abstractMapStateToProps(state),
        _iAmRecorder: state['features/base/config'].iAmRecorder,
        _isLobbyScreenVisible: state['features/base/dialog']?.component === LobbyScreen,
        _layoutClassName: LAYOUT_CLASSNAMES[getCurrentLayout(state)],
        _roomName: getConferenceNameForTitle(state),
        _showPrejoin: isPrejoinPageVisible(state)
    };
}

    // Helper for formatting text in hh:mm format.
function _msToHms(d) {
    d = Number(d) / 1000;
    let h = Math.floor(d / 3600);
    let m = Math.floor(d % 3600 / 60);
    let s = Math.floor(d % 3600 % 60);

    let time = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    if (h > 0) time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return time;
}

export default reactReduxConnect(_mapStateToProps)(translate(Conference));
