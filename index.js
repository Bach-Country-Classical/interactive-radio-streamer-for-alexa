'use strict';
const Alexa = require('ask-sdk-core');
const https = require('https');
const { createHash } = require('crypto');
const COMPOSERS = require('./composers.json');
const catalogKey = value => clean(value).normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const composerFor = now => COMPOSERS[catalogKey(now.title) + '|' + catalogKey(now.artist)] || null;

// ===== STATION SETUP: REPLACE THE PLACEHOLDERS BELOW =====
// Example is intended for MyRadioStream-compatible JSON metadata.
// INSERT AUDIO STREAM URL HERE (HTTPS; supported format for your target device)
const STREAM = 'https://YOUR-AUDIO-STREAM-URL-HERE.example/live.mp3';
// INSERT PUBLIC HTTPS STATION LOGO URL HERE
const LOGO = 'https://YOUR-LOGO-URL-HERE.example/logo.png';
// INSERT NOW-PLAYING METADATA URL HERE (matching format required)
const STATS = 'https://YOUR-METADATA-URL-HERE.example/stats?sid=1&json=1';
const SCREEN_TOKEN = 'your-station-screen-v1';
// DISPLAY UPDATES EVERY 30 SECONDS
const POLL_MS = 30000;
// INSERT STATION NAME AND WEBSITE HERE (and update the spoken messages below)
const FALLBACK = { title: 'Your Station Name', artist: 'Live radio · YourStation.example', fresh: false };
const clean = value => String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 600);
const escape = value => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');

function parseMetadata(stats) {
  // Strip the station automation's selection index, e.g. '676. Joshua Bell'.
  const song = clean(stats.songtitle).replace(/^\d+\.\s+/, '');
  if (!song || /station break/i.test(song) || Number(stats.streamstatus) !== 1) return { ...FALLBACK };
  const split = song.indexOf(' - ');
  return {
    title: split >= 0 ? song.slice(split + 3).trim() : song,
    artist: split >= 0 ? song.slice(0, split).trim() : 'Your Station Name',
    fresh: true
  };
}

// Hard deadline includes DNS/TLS, and failure never prevents listening.
function fetchMetadata() {
  return new Promise(resolve => {
    let settled = false;
    let request;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => { finish({ ...FALLBACK }); if (request) request.destroy(); }, 1500);
    request = https.get(STATS, response => {
      if (response.statusCode !== 200) { response.resume(); finish({ ...FALLBACK }); return; }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 65536) { finish({ ...FALLBACK }); response.destroy(); }
      });
      response.on('end', () => {
        try { finish(parseMetadata(JSON.parse(body))); } catch (_) { finish({ ...FALLBACK }); }
      });
      response.on('error', () => finish({ ...FALLBACK }));
    });
    request.on('error', () => finish({ ...FALLBACK }));
  });
}

// Recomputed with each metadata response, including daylight-saving transitions.
function easternOffset(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const value = type => Number(parts.find(p => p.type === type).value);
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour') % 24, value('minute'), value('second'))
    - Math.floor(now.getTime() / 1000) * 1000;
}

// CUSTOMIZE THE DISPLAY BACKGROUND (#17304F) AND TEXT (#E5D0AC) COLORS BELOW.
function documentFor(now) {
  return {
    type: 'APL', version: '1.7', theme: 'dark',
    mainTemplate: { item: {
      type: 'Container', id: 'RadioScreenRoot', width: '100vw', height: '100vh',
      bind: [
        { name: 'AutoRefreshEnabled', value: true, type: 'boolean' },
        { name: 'IsPlaying', value: true, type: 'boolean' },
        { name: 'EasternOffset', value: easternOffset(), type: 'number' }
      ],
      // Let the media component start when ready, rather than racing its mount/load.
      onMount: [],
      handleTick: [{ minimumDelay: POLL_MS, when: '${AutoRefreshEnabled}', commands: [{
        type: 'SendEvent', sequencer: 'RadioMetadataPoll', arguments: ['autoMetadata', SCREEN_TOKEN]
      }] }],
      items: [
        { type: 'Frame', width: '100%', height: '100%', position: 'absolute', backgroundColor: '#17304F' },
        // APL media stream; retain native fallback on failure.
        { type: 'Video', id: 'RadioStream', width: '1dp', height: '1dp', position: 'absolute',
          audioTrack: 'background', source: STREAM, autoplay: true,
          onPlay: [{ type: 'SendEvent', arguments: ['screenMediaStarted', SCREEN_TOKEN] }],
          onTrackFail: [{ type: 'SetValue', componentId: 'RadioScreenRoot', property: 'AutoRefreshEnabled', value: false }, { type: 'SendEvent', sequencer: 'RadioMediaFallback', arguments: ['nativeFallback', SCREEN_TOKEN] }] },
        { type: 'Container', width: '100%', height: '100%', paddingLeft: '5vw', paddingRight: '5vw',
          paddingTop: '4vh', paddingBottom: '4vh', items: [
          { type: 'Container', direction: 'row', width: '100%', justifyContent: 'spaceBetween', alignItems: 'center', items: [
            { type: 'Text', fontFamily: 'Arial, sans-serif', fontWeight: 400, id: 'WebsiteInvitation', text: 'Visit YourStation.example',
              color: '#E5D0AC', fontSize: '24dp', maxLines: 1, grow: 1, shrink: 1 },
            { type: 'Text', fontFamily: 'Arial, sans-serif', fontWeight: 400, id: 'LocalClock', text: "${Time.format('h:mm', utcTime + EasternOffset)} ${Time.hours(utcTime + EasternOffset) >= 12 ? 'PM' : 'AM'} ET",
              color: '#E5D0AC', fontSize: '28dp', textAlign: 'right', maxLines: 1 }
          ] },
          { type: 'Container', direction: 'row', width: '100%', grow: 1, shrink: 1, alignItems: 'center', paddingTop: '3vh', paddingBottom: '2vh', items: [
            { type: 'Image', id: 'StationLogo', source: LOGO, accessibilityLabel: 'Your Station Name',
              width: '23vw', height: '23vw', maxHeight: '44vh', scale: 'best-fit', shrink: 0 },
            { type: 'ScrollView', width: '63vw', height: '100%', grow: 1, shrink: 1, paddingLeft: '4vw', item: {
            type: 'Container', width: '100%', minHeight: '100%', justifyContent: 'center', items: [
              { type: 'Text', fontFamily: 'Arial, sans-serif', fontWeight: 400, id: 'NowPlayingTitle', text: escape(now.title), width: '100%',
                fontSize: '${Math.min(viewport.width * 0.045, 36)}', color: '#E5D0AC' },
              { type: 'Text', fontFamily: 'Arial, sans-serif', fontWeight: 400, id: 'NowPlayingArtist', text: escape(now.artist), width: '100%', paddingTop: '16dp',
                fontSize: '${Math.min(viewport.width * 0.035, 26)}', color: '#E5D0AC' }
            ]
          } }
          ] },
          { type: 'Container', direction: 'row', width: '100%', justifyContent: 'spaceBetween', alignItems: 'center', items: [
            { type: 'Text', fontFamily: 'Arial, sans-serif', fontWeight: 400, id: 'MetadataStatus', text: now.fresh ? 'LIVE · YOURSTATION.EXAMPLE' : 'LIVE · TRACK INFORMATION UNAVAILABLE',
              color: '#E5D0AC', fontSize: '16dp', grow: 1, shrink: 1, maxLines: 2 },
            { type: 'TouchWrapper', id: 'PlaybackControl', accessibilityLabel: "${IsPlaying ? 'Pause music' : 'Play music'}",
              width: '120dp', height: '52dp', onPress: [
                { type: 'ControlMedia', componentId: 'RadioStream', command: "${IsPlaying ? 'pause' : 'play'}" },
                { type: 'SetValue', componentId: 'RadioScreenRoot', property: 'AutoRefreshEnabled', value: '${!IsPlaying}' },
                { type: 'SetValue', componentId: 'RadioScreenRoot', property: 'IsPlaying', value: '${!IsPlaying}' }
              ], item: { type: 'Frame', width: '100%', height: '100%', backgroundColor: '#17304F', borderRadius: '8dp', item: {
                type: 'Text', fontFamily: 'Arial, sans-serif', fontWeight: 400, text: "${IsPlaying ? 'PAUSE' : 'PLAY'}", color: '#E5D0AC', fontSize: '20dp',
                width: '100%', height: '100%', textAlign: 'center', textAlignVertical: 'center'
              } }
            }
          ] }
        ] }
      ]
    } }
  };
}

const type = h => h.requestEnvelope.request.type;
const intent = h => h.requestEnvelope.request.intent?.name;
const action = h => type(h) === 'Alexa.Presentation.APL.UserEvent' ? h.requestEnvelope.request.arguments?.[0] : null;
const supportsApl = h => Boolean(h.requestEnvelope.context?.System?.device?.supportedInterfaces?.['Alexa.Presentation.APL']);
function render(h, now) {
  if (supportsApl(h)) h.responseBuilder.addDirective({ type: 'Alexa.Presentation.APL.RenderDocument', token: SCREEN_TOKEN, document: documentFor(now), timeoutType: 'LONG' });
}

function nativePlay(h, now) {
  const token = 'radio-stream-' + createHash('sha256').update(JSON.stringify(now)).digest('hex').slice(0, 24);
  return h.responseBuilder.addDirective({
    type: 'AudioPlayer.Play', playBehavior: 'REPLACE_ALL', audioItem: {
      stream: { url: STREAM, token, offsetInMilliseconds: 0 },
      metadata: { title: now.title, subtitle: now.artist }
    }
  }).withShouldEndSession(true).getResponse();
}
function screenPlayback(h, playing) {
  return h.responseBuilder.addDirective({ type: 'Alexa.Presentation.APL.ExecuteCommands', token: SCREEN_TOKEN, commands: [
    { type: 'ControlMedia', componentId: 'RadioStream', command: playing ? 'play' : 'pause' },
    { type: 'SetValue', componentId: 'RadioScreenRoot', property: 'IsPlaying', value: playing },
    { type: 'SetValue', componentId: 'RadioScreenRoot', property: 'AutoRefreshEnabled', value: playing }
  ] }).getResponse();
}
const LaunchHandler = {
  canHandle: h => type(h) === 'LaunchRequest' || intent(h) === 'AMAZON.NavigateHomeIntent',
  async handle(h) {
    const now = await fetchMetadata();
    h.responseBuilder.speak('Welcome to Your Station Name, your home for great music. Enjoy the music.');
    if (!supportsApl(h)) return nativePlay(h, now);
    render(h, now);
    return h.responseBuilder.getResponse();
  }
};
const PlayHandler = {
  canHandle: h => action(h) === 'play' || action(h) === 'nativeFallback' || ['PlayStreamIntent', 'AMAZON.ResumeIntent'].includes(intent(h)) || type(h) === 'PlaybackController.PlayCommandIssued',
  async handle(h) {
    if (action(h) === 'nativeFallback') {
      if (!currentScreen(h)) return h.responseBuilder.getResponse();
      console.log('RADIO_SCREEN_MEDIA_FAILED_NATIVE_FALLBACK');
      return nativePlay(h, await fetchMetadata());
    }
    if (currentScreen(h)) return screenPlayback(h, true);
    const now = await fetchMetadata();
    if (supportsApl(h) && !type(h).startsWith('PlaybackController.')) {
      render(h, now); return h.responseBuilder.getResponse();
    }
    return nativePlay(h, now);
  }
};
function currentScreen(h) {
  const contextToken = h.requestEnvelope.context?.['Alexa.Presentation.APL']?.token;
  if (contextToken) return contextToken === SCREEN_TOKEN;
  // UserEvent identifies its originating document even when visual context is absent.
  return type(h) === 'Alexa.Presentation.APL.UserEvent'
    && h.requestEnvelope.request.token === SCREEN_TOKEN;
}
function updateMetadataText(h, now) {
  const clock = { type: 'SetValue', componentId: 'RadioScreenRoot', property: 'EasternOffset', value: easternOffset() };
  const commands = now.fresh ? [
    clock,
    { type: 'SetValue', componentId: 'NowPlayingTitle', property: 'text', value: escape(now.title) },
    { type: 'SetValue', componentId: 'NowPlayingArtist', property: 'text', value: escape(now.artist) },
    { type: 'SetValue', componentId: 'MetadataStatus', property: 'text', value: 'LIVE · UPDATED ' + new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date()) + ' ET' }
  ] : [
    clock,
    { type: 'SetValue', componentId: 'MetadataStatus', property: 'text', value: 'METADATA UNAVAILABLE · RETRYING' }
  ];
  h.responseBuilder.addDirective({ type: 'Alexa.Presentation.APL.ExecuteCommands', token: SCREEN_TOKEN, commands });
}
// Text-only polling experiment: no playback commands, speech, or screen recreation.
const AutoMetadataHandler = {
  canHandle: h => action(h) === 'autoMetadata',
  async handle(h) {
    const validToken = h.requestEnvelope.request.token === SCREEN_TOKEN;
    const contextToken = h.requestEnvelope.context?.['Alexa.Presentation.APL']?.token;
    console.log('RADIO_METADATA_EVENT', JSON.stringify({
      eventTokenMatches: validToken,
      visualContext: contextToken ? (contextToken === SCREEN_TOKEN ? 'MATCH' : 'OTHER') : 'MISSING',
      nativeAudio: h.requestEnvelope.context?.AudioPlayer?.playerActivity || 'UNKNOWN'
    }));
    if (!validToken || !currentScreen(h)) return h.responseBuilder.getResponse();
    const now = await fetchMetadata();
    console.log('RADIO_METADATA_TICK', JSON.stringify({ fresh: now.fresh, nativeAudio: h.requestEnvelope.context?.AudioPlayer?.playerActivity || 'UNKNOWN' }));
    updateMetadataText(h, now);
    return h.responseBuilder.getResponse();
  }
};
const StopHandler = {
  canHandle: h => action(h) === 'stop' || ['AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.PauseIntent'].includes(intent(h)) || type(h) === 'PlaybackController.PauseCommandIssued',
  handle: h => {
    if (currentScreen(h)) screenPlayback(h, false);
    else h.responseBuilder.addAudioPlayerStopDirective().withShouldEndSession(true);
    // Farewell speech is device-dependent during playback termination.
    return h.responseBuilder.speak('Thanks for listening to Your Station Name. Learn more at your station website.').getResponse();
  }
};
const MetadataHandler = {
  canHandle: h => action(h) === 'refresh' || ['WhatsPlayingIntent', 'RefreshMetadataIntent', 'ComposerIntent', 'PerformerIntent'].includes(intent(h)),
  async handle(h) {
    const now = await fetchMetadata();
    // Answer without recreating an APL player or restarting the stream.
    const screen = currentScreen(h);
    if (screen) updateMetadataText(h, now);
    const builder = h.responseBuilder;
    if (action(h) !== 'refresh') {
      let speech;
      if (!now.fresh) speech = 'Current track information is unavailable. The music can keep playing.';
      else if (intent(h) === 'PerformerIntent') speech = `The station lists the performers as ${escape(now.artist)}.`;
      else if (intent(h) === 'ComposerIntent') {
        const composer = composerFor(now);
        speech = composer ? `Your music catalog lists the composer as ${escape(composer)}.`
          : 'The station feed does not identify the composer, and I do not have a confirmed catalog match for this selection.';
      } else speech = `The station currently lists ${escape(now.title)}, by ${escape(now.artist)}.`;
      builder.speak(speech);
    }
    // Avoid opening the microphone after an answer and holding playback ducked.
    if (screen) return builder.getResponse();
    return builder.withShouldEndSession(true).getResponse();
  }
};
const HelpHandler = {
  canHandle: h => ['AMAZON.HelpIntent', 'AMAZON.FallbackIntent', 'HelloWorldIntent'].includes(intent(h)),
  handle: h => h.responseBuilder.speak("You're listening to Your Station Name. You can ask what's playing, who's the composer, or who's performing. You can also say stop.")
    .reprompt('You can say play, or what is playing.').withShouldEndSession(false).getResponse()
};
const EventHandler = {
  canHandle: h => action(h) === 'screenMediaStarted' || type(h).startsWith('AudioPlayer.') || type(h) === 'SessionEndedRequest' || type(h) === 'System.ExceptionEncountered',
  handle(h) {
    if (action(h) === 'screenMediaStarted' && currentScreen(h)) console.log('RADIO_SCREEN_MEDIA_STARTED');
    if (type(h) === 'AudioPlayer.PlaybackFailed') console.error('Playback failed:', h.requestEnvelope.request.error?.type);
    return h.responseBuilder.getResponse();
  }
};
const UnsupportedHandler = {
  canHandle: h => ['AMAZON.NextIntent', 'AMAZON.PreviousIntent', 'AMAZON.LoopOnIntent', 'AMAZON.LoopOffIntent', 'AMAZON.ShuffleOnIntent', 'AMAZON.ShuffleOffIntent', 'AMAZON.StartOverIntent'].includes(intent(h)),
  handle: h => h.responseBuilder.speak('This is live radio. Tracks cannot be skipped or rewound.').withShouldEndSession(true).getResponse()
};
const ErrorHandler = {
  canHandle: () => true,
  handle(h, error) {
    console.error('Skill request failed:', error.message);
    if (action(h) === 'autoMetadata' || type(h).startsWith('AudioPlayer.') || type(h).startsWith('PlaybackController.') || type(h) === 'SessionEndedRequest' || type(h) === 'System.ExceptionEncountered') return h.responseBuilder.getResponse();
    return h.responseBuilder.speak('Sorry, I could not complete that request. Please try again.').withShouldEndSession(true).getResponse();
  }
};
exports.handler = Alexa.SkillBuilders.custom().addRequestHandlers(LaunchHandler, PlayHandler, StopHandler, AutoMetadataHandler, MetadataHandler, HelpHandler, EventHandler, UnsupportedHandler).addErrorHandlers(ErrorHandler).lambda();
