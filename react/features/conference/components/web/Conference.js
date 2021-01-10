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

import firebase from 'firebase';

declare var APP: Object;
declare var interfaceConfig: Object;

let db;
let userId;
let sessionId;
let pauseTimer = 0;
let pauseInterval = false;
let ytPlayer;

/* GUIDE VARS */
let prompts = [];
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
                <section>
                    <div id='guide-controls'>
                    <button id='start-prompt' className='guide-button' onClick={this._startPrompt}>Start Prompts</button>
                    <div id='next' style={{display:'none'}}>
                        <div id='next-timer'></div>
                        <div id='next-prompt' onClick={this._nextPrompt}></div>

                        <button id='pause-prompt' className='guide-button' style={{display:'none'}} onClick={this._pausePrompt}>Pause Prompts</button>
                        <button id='resume-prompt' className='guide-button' style={{display:'none'}} onClick={this._resumePrompt}>Resume Prompts</button>
                        <button id='skip-prompt' className='guide-button' style={{display:'none'}} onClick={this._nextPrompt}>Skip Prompt</button>
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
                    </div>

                    <div id='participant-controls' style={{display:'none'}}>
                    <button id='pause-group' onClick={this._triggerPauseGroup}>Group Pause</button>
                    </div>
                    
                    <div id='overlay'>
                    <div id='ytPlayer'></div>
                    <div id='pause-timer'></div>
                    </div>
                </section>
                
                <div id='notif-holder'>
                    <div id='notif'></div>
                </div>
                    
                </main>
                <Notice />
                <div id = 'videospace'>
                    <LargeVideo />
                    <KnockingParticipantList />
                    <Filmstrip />
                    { hideLabels || <Labels /> }
                </div>

                { _showPrejoin || _isLobbyScreenVisible || <Toolbox /> }
                <Chat />

                { this.renderNotificationsContainer() }

                <CalleeInfoContainer />

                { _showPrejoin && <Prejoin />}
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
    _initializeFirebase = () => {

        const firebaseConfig = {
            apiKey: process.env.REACT_APP_FIREBASE_APIKEY,
            authDomain: "beyond-the-breakdown.firebaseapp.com",
            databaseURL: "https://beyond-the-breakdown.firebaseio.com",
            projectId: "beyond-the-breakdown",
            storageBucket: "beyond-the-breakdown.appspot.com",
            messagingSenderId: "516765643646",
            appId: "1:516765643646:web:3c2001a0fdf413c457392f",
            measurementId: "G-95RNYT6BL4"
        };
        firebase.initializeApp(firebaseConfig);
        firebase.auth().signInAnonymously().catch(function(error) { console.log('LM error ' + error); });
        db = firebase.firestore();
    }
  
    _initSession = () => {
        // Setup listener for firestore changes
        let now = new Date().getTime();
        db.collection('messages').where('timestamp', '>', now).onSnapshot({}, (snapshot) => {
            let that = this;
            snapshot.docChanges().forEach(function(change) {
                let msg = change.doc.data();
                if (change.type !== 'added') return;
                else if (msg.sessionId !== sessionId) return;
                else if (msg.type === 'pauseGroup') that._pauseGroup(msg.val);
                else if (msg.type === 'guide') that._playMessage(msg.val, true);
                else console.log('LM badType:', msg.type)
            });
        });
  
        let tag = document.createElement('script');
        tag.id = 'iframe-demo';
        tag.src = 'https://www.youtube.com/iframe_api';
        let firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    _onYouTubeIframeAPIReady = () => {
        ytPlayer = new YT.Player('ytPlayer', {
            videoId: 't0NHILIwO2I',
            playerVars: {
                'autoplay': 0,
                'controls': 0,
                'rel': 0,
                'fs': 0,
                'modestbranding': 1
            }
        });
    }
  
    // Called when participant joins.
    _joined = (e) => {
        userId = e.id;
        $('#participant-controls').show();
    }
  
    _sendMessage = (type, val) => {
        let m = {
            type: type,
            sessionId: sessionId,
            val: val,
            timestamp: new Date().getTime()
        };
        // console.log('LM send message')
        // console.log(m)
        db.collection('messages').add(m);
    };
  
    _triggerPauseGroup = () => {
        if (guide) this._pausePrompt();
        this._sendMessage('pauseGroup', 10000); // 10 second pause
    }
  
    _triggerTextPrompt = () => {
        console.log('LM triggerTextPrompt');
        const msg = $('#prompt-text').val();
        if (msg) this._sendMessage('guide', msg);
        $('#prompt-text').val('');
    };
  
    _triggerPrompt = () => {
        this._sendMessage('guide', prompts[currentPrompt].options[currentOption]);
    }
  
    _pauseGroup = (ms) => {
        if (pauseInterval) clearInterval(pauseInterval);
        pauseTimer = performance.now() + ms;
        $('#pause-timer').text(this._msToHms(ms));
        $('#overlay').fadeIn(0).delay(ms).fadeOut(0);
        ytPlayer.playVideo();
        //   api.isAudioMuted().then(muted => {
        //     if (!muted) api.executeCommand('toggleAudio');
        //   }); TODO
        setTimeout(function() {
            // api.executeCommand('toggleAudio'); //TOD
            ytPlayer.stopVideo();
            if (guide && currentPrompt > -1) this._resumePrompt();
        }, ms);
        pauseInterval = setInterval(function() {
            const remaining = pauseTimer - performance.now();
            $('#pause-timer').text(this._msToHms(remaining));
        });
    }
  
    _playMessage = (msg, doSpeak) => {
        $('#notif').text(msg);
        $('#notif-holder').stop().fadeIn(300).delay(4000).fadeOut(300);
        if (doSpeak) this._speak(msg);
        console.log('LM _playMessage: ' + msg);
    }
  
    // Speaks a message in the browser via TTS.
    _speak = (msg) => {
        const utter = new SpeechSynthesisUtterance(msg);
        utter.rate = 0.9;
        window.speechSynthesis.speak(utter);
    }
  
    /* GUIDE */
    _initGuide = () => {
        console.log('LM init')
        $.ajax(`${window.location.origin}/static/data/prompts.tsv`)
            .done(data => {
                console.log('LM loaded prompts from TSV');
                this._convertTsvIntoObjects(data);
                $('#guide-controls').show();
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
            $('#next-timer').text('Next prompt in ' + this._msToHms(remaining));
        }
    }
  
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
                let offset = this._offsetToMs(cols[0]);
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
  
    // Helper for formatting text in hh:mm format.
    _msToHms = (d) => {
        d = Number(d) / 1000;
        let h = Math.floor(d / 3600);
        let m = Math.floor(d % 3600 / 60);
        let s = Math.floor(d % 3600 % 60);
  
        let time = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        if (h > 0) time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        return time;
    }
  
    _offsetToMs = (offset) => {
        const minSec = offset.split(':');
        return 1000 * (parseInt(minSec[1]) + parseInt(minSec[0]) * 60);
    }
        
  

    /**
     * Until we don't rewrite UI using react components
     * we use UI.start from old app. Also method translates
     * component right after it has been mounted.
     *
     * @inheritdoc
     */
    _start() {
        console.log('LM START');
        APP.UI.start();

        APP.UI.registerListeners();
        APP.UI.bindEvents();

        FULL_SCREEN_EVENTS.forEach(name =>
            document.addEventListener(name, this._onFullScreenChange));

        const { dispatch, t } = this.props;

        dispatch(connect());

        maybeShowSuboptimalExperienceNotification(dispatch, t);

        this._initializeFirebase();

        // Parse URL params, show HTML elements depending on view
        const params = window.location.pathname.substring(1).split('-');
        sessionId = params[0];
        if (!sessionId.length) {
          $('#error').show(); // TODO show error page
        }
        const guide = params[1] === 'guide';
        console.log('LM ' + sessionId + ' ' + guide);
        if (guide) this._initGuide();
        
        this._initSession();
        


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

export default reactReduxConnect(_mapStateToProps)(translate(Conference));
