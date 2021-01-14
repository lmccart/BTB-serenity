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

let app;
let db;
let userId = 'TODOpid';
let userName = 'Builder';
let sessionId;
let pauseTimer = 0;
let pauseInterval = false;

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
        document.title = `${this.props._roomName} | ${interfaceConfig.APP_NAME}`;
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
                            muted={true}
                            id='group-pause-player' 
                            ref={(player) => { this.player = player }}>
                            <ControlBar disableCompletely={true} />
                        </Player>
                        <div id='group-pause-timer'></div>
                    </section>
                    <section id='notif-holder'>
                        <div id='notif'></div>
                    </section>

                    <section id='group-chat' style={{display:'none'}}>
                        <h3 className='sr-only'>Chat</h3>
                        <div id='chat-messages'></div>
                        <label htmlFor='chat-input' className='sr-only'>Input Message</label>
                        <input type='text' id='chat-input' placeholder='Type a message'/>
                        <button id='chat-send' onClick={this._sendChat} className='sr-only'>Send</button>
                    </section>

                    <section id='facilitator-controls' style={{display:'none'}} aria-hidden='true'>
                        <button id='start-prompt' className='facilitator-button' onClick={this._startPrompt}>Start Prompts</button>
                        <div id='next' style={{display:'none'}}>
                            <div id='next-timer'></div>
                            <div id='next-prompt' onClick={this._nextPrompt}></div>

                            <button id='pause-prompt' className='facilitator-button' style={{display:'none'}} onClick={this._pausePrompt}>Pause Prompts</button>
                            <button id='resume-prompt' className='facilitator-button' style={{display:'none'}} onClick={this._resumePrompt}>Resume Prompts</button>
                            <button id='skip-prompt' className='facilitator-button' style={{display:'none'}} onClick={this._nextPrompt}>Skip Prompt</button>
                        </div>

                        <div id='text'>
                            <textarea id='prompt-text'></textarea>
                            <button id='trigger-prompt' onClick={this._triggerTextPrompt}>Speak</button>
                        </div>

                        <div id='form' style={{display:'none'}}>
                            <label htmlFor='world-name'>World name</label>
                            <textarea id='world-name'></textarea>
                            <label htmlFor='world-values'>World values</label>
                            <textarea id='world-values'></textarea>
                            <label htmlFor='world-description'>World description</label>
                            <textarea id='world-description'></textarea>
                            <button id='world-submit' onClick={this._submitWorld}>Submit</button>
                        </div>
                    </section>


                </main>
                    
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
                src: `https://www.gstatic.com/firebasejs/7.18.0/firebase-app.js`,
                onload: () => resolve(firebase.initializeApp(config)),
                onerror: reject
            }));
    })};
    _loadAuth = () => { 
        return new Promise( (resolve, reject) => {
            document.body.appendChild(Object.assign(document.createElement('script'), {
                src: `https://www.gstatic.com/firebasejs/7.18.0/firebase-auth.js`,
                onload: () => resolve(firebase),
                onerror: reject
            }));
    })};
    _loadFirestore = () => { 
        return new Promise( (resolve, reject) => {
            document.body.appendChild(Object.assign(document.createElement('script'), {
                src: `https://www.gstatic.com/firebasejs/7.18.0/firebase-firestore.js`,
                onload: () => resolve(firebase),
                onerror: reject
            }));
    })};
  
    _initSession = () => {
        console.log('LM _initSession')
        if (facilitator) this._initFacilitator();

        $('#participant-controls').show();
        $('#chat-input').on('keypress', (e) => { if (e.which === 13) this._sendChat();});

        // Setup listener for firestore changes
        let now = new Date().getTime();
        db.collection('messages').where('timestamp', '>', now).onSnapshot({}, (snapshot) => {
            let that = this;
            snapshot.docChanges().forEach(function(change) {
                let msg = change.doc.data();
                console.log(msg)
                if (change.type !== 'added') return;
                else if (msg.sessionId !== sessionId) return;
                else if (msg.type === 'group-pause') that._groupPause(msg.val);
                else if (msg.type === 'group-chat') that._groupChatMessage(msg.val);
                else if (msg.type === 'serenity') that._playPrompt(msg.val, true);
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

    _sendChat = () => {
        const data = {
            msg: $('#chat-input').val(),
            userId: userId,
            userName: userName 
        }
        if (data.msg) this._sendMessage('group-chat', data);
        $('#chat-input').val('');
    }

    _groupChatMessage = (data) => {
        let elt = $('<div class="chat-message"><span class="chat-user">'+data.userName+'</span><span class="chat-text">'+data.msg+'</span></div>');
        if (data.userName === 'Serenity') elt.addClass('serenity-message');
        $('#chat-messages').append(elt);
    }
  
    _triggerHelp = () => {
        let randomPrompt = extraPrompts[Math.floor(Math.random() * extraPrompts.length)];
        this._sendMessage('serenity', randomPrompt);
    }
    _triggerGroupPause = () => {
        if (facilitator) this._pausePrompt();
        this._sendMessage('group-pause', 100000); // 10 second pause
    }

    _toggleChat = () => {
        $('#group-chat').toggle();
    }
  
    _groupPause = (ms) => {
        if (pauseInterval) clearInterval(pauseInterval);
        pauseTimer = performance.now() + ms;
        $('#group-pause-timer').text(_msToHms(ms));
        $('#group-pause-overlay').fadeIn(0).delay(ms).fadeOut(0);
        this.player.play();
        //   api.isAudioMuted().then(muted => {
        //     if (!muted) api.executeCommand('toggleAudio');
        //   }); TODO
        let player = this.player;
        setTimeout(function() {
            // api.executeCommand('toggleAudio'); //TODO
            player.pause();
            if (facilitator && currentPrompt > -1) this._resumePrompt();
        }, ms);
        pauseInterval = setInterval(function() {
            const remaining = pauseTimer - performance.now();
            $('#group-pause-timer').text(_msToHms(remaining));
        });
    }
  
    _playPrompt = (msg, doSpeak) => {
        $('#notif').text(msg);
        this._groupChatMessage({msg: msg, userName: 'Serenity'});
        $('#notif-holder').stop().fadeIn(300).delay(4000).fadeOut(300);
        if (doSpeak) this._speak(msg);
        console.log('LM _playPrompt: ' + msg);
    }
  
    // Speaks a message in the browser via TTS.
    _speak = (msg) => {
        const utter = new SpeechSynthesisUtterance(msg);
        utter.rate = 0.9;
        window.speechSynthesis.speak(utter);
    }
  
    /* FACILITATOR */
    _initFacilitator = () => {
        console.log('LM init')
        $.ajax(`${window.location.origin}/static/data/extra-prompts.txt`)
            .done(data => {
                extraPrompts = data.split('\n').filter(Boolean);
                console.log(extraPrompts);
            });
        $.ajax(`${window.location.origin}/static/data/prompts.tsv`)
            .done(data => {
                console.log('LM loaded prompts from TSV');
                this._convertTsvIntoObjects(data);
                $('#facilitator-controls').show();
            });
    }
  
    _startPrompt = () => {
        $('#start-prompt').hide();
        $('#next').show();
        $('#pause-prompt').show();
        $('#skip-prompt').show();
        this._nextPrompt();
    }
  
    _nextPrompt = () => {
        if (promptInterval) clearInterval(promptInterval);
        currentPrompt++;
        if (currentPrompt < prompts.length) {
            promptInterval = setInterval(this._checkPrompt, 100);
            promptTimer = prompts[currentPrompt].lastOffset + performance.now();
            let options = prompts[currentPrompt].options;
            currentOption = Math.floor(Math.random() * options.length);
            $('#next-prompt').text(options[currentOption]);
        } else {
            $('#next').hide();
            $('#form').show();
        }
    }
  
    _resumePrompt = () => {
        if (pauseInterval) clearInterval(pauseInterval);
        promptTimer += performance.now();
        promptInterval = setInterval(this._checkPrompt, 100);
        $('#resume-prompt').hide();
        $('#pause-prompt').show();
    }
  
    _pausePrompt = () => {
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
  
    _submitWorld = () => {
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
        db.collection('sessions').doc(sessionId).set(w, {
            merge: true
        });
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

        console.log('LM START');
        $('<link/>', {
            rel: 'stylesheet',
            type: 'text/css',
            href: 'static/style.css'
         }).appendTo('head');

        const params = window.location.pathname.substring(1).split('-');
        sessionId = params[0];
        userId = params[1];
        // if (!sessionId.length || !userId.length) {
        //     $('#error').show(); // TODO show error page
        // }
        facilitator = userId === 'facilitator';
        console.log('LM ' + sessionId + ' ' + userId + ' ' + facilitator);

        this._initFirebase()
        .then(this._initSession);
    }
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
