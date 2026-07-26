/**
 * The Inbox Herald - standalone Gmail newspaper.
 * Deploy as a web app under the Google account whose inbox feeds the paper.
 * Requires the Gmail Advanced Service (declared in appsscript.json).
 */

var LABEL_SAVED = 'Newsboy/Saved';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('The Inbox Herald')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function boot() {
  var p = PropertiesService.getUserProperties();
  return {
    email: (Session.getActiveUser().getEmail() || '').toLowerCase(),
    dim: JSON.parse(p.getProperty('nb_dim') || '{}'),
    removed: JSON.parse(p.getProperty('nb_removed') || '{}'),
    blockedSenders: JSON.parse(p.getProperty('nb_blocked') || '{}')
  };
}

function findLabelId_(name) {
  var res = Gmail.Users.Labels.list('me');
  var labels = res.labels || [];
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].name === name) return labels[i].id;
  }
  return null;
}

function parseAddr_(raw) {
  var m = String(raw || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(raw || '')).trim().toLowerCase();
}

/**
 * Returns flat message items in [startMs, endMs). Excludes conversations the
 * account owner participated in, plus SENT/DRAFT/TRASH/SPAM. `fresh` skips the
 * 10-minute cache.
 */
function getIssue(startMs, endMs, fresh) {
  var cache = CacheService.getUserCache();
  var key = 'nb_iss_' + Math.floor(startMs / 600000) + '_' + Math.floor(endMs / 600000);
  if (!fresh) {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  }
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var q = 'after:' + Math.floor(startMs / 1000) + ' before:' + Math.floor(endMs / 1000) +
          ' -in:sent -in:draft -in:chats';
  var ids = [], token = null, pages = 0;
  do {
    var res = Gmail.Users.Messages.list('me', { q: q, maxResults: 100, pageToken: token || undefined });
    (res.messages || []).forEach(function (m) { ids.push(m.id); });
    token = res.nextPageToken;
    pages++;
  } while (token && pages < 5);

  var savedLabelId = findLabelId_(LABEL_SAVED);
  var byThread = {};
  ids.forEach(function (id) {
    var m = Gmail.Users.Messages.get('me', id, {
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'To']
    });
    var h = {};
    ((m.payload && m.payload.headers) || []).forEach(function (x) { h[x.name.toLowerCase()] = x.value; });
    var sender = parseAddr_(h['from']);
    var labels = m.labelIds || [];
    var item = {
      id: m.id,
      threadId: m.threadId,
      ts: Number(m.internalDate),
      sender: sender,
      fromMe: sender === email,
      subject: h['subject'] || '(no subject)',
      snippet: m.snippet || '',
      to: String(h['to'] || '').split(',').map(parseAddr_).filter(Boolean),
      unread: labels.indexOf('UNREAD') >= 0,
      saved: savedLabelId ? labels.indexOf(savedLabelId) >= 0 : false,
      skip: ['SENT', 'DRAFT', 'TRASH', 'SPAM'].some(function (l) { return labels.indexOf(l) >= 0; })
    };
    (byThread[item.threadId] = byThread[item.threadId] || []).push(item);
  });

  var out = [];
  Object.keys(byThread).forEach(function (tid) {
    var msgs = byThread[tid];
    if (msgs.some(function (m) { return m.fromMe; })) return; // conversation
    msgs.forEach(function (m) {
      if (m.skip) return;
      delete m.skip;
      delete m.fromMe;
      out.push(m);
    });
  });

  try { cache.put(key, JSON.stringify(out), 600); } catch (e) { /* too big for cache: fine */ }
  return out;
}

/** Full plain-text body; opening an article marks it read in Gmail. */
function getBody(messageId) {
  var msg = GmailApp.getMessageById(messageId);
  var text = msg.getPlainBody();
  if (!text) {
    text = msg.getBody().replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
  }
  try { msg.markRead(); } catch (e) {}
  return { body: text };
}

function setRead(messageId, read) {
  var msg = GmailApp.getMessageById(messageId);
  if (read) msg.markRead(); else msg.markUnread();
  return true;
}

/** Saved-for-later: real Gmail label on the thread + a snapshot for the scrapbook. */
function setSaved(messageId, on, snapshot) {
  var label = GmailApp.getUserLabelByName(LABEL_SAVED) || GmailApp.createLabel(LABEL_SAVED);
  var thread = GmailApp.getMessageById(messageId).getThread();
  if (on) label.addToThread(thread); else label.removeFromThread(thread);

  var p = PropertiesService.getUserProperties();
  var clips = JSON.parse(p.getProperty('nb_clips') || '{}');
  if (on && snapshot) clips[messageId] = snapshot;
  else delete clips[messageId];
  var keys = Object.keys(clips);
  if (keys.length > 100) { // keep the 100 newest
    keys.sort(function (a, b) { return (clips[a].ts || 0) - (clips[b].ts || 0); });
    keys.slice(0, keys.length - 100).forEach(function (k) { delete clips[k]; });
  }
  p.setProperty('nb_clips', JSON.stringify(clips));
  return true;
}

function getClips() {
  var clips = JSON.parse(PropertiesService.getUserProperties().getProperty('nb_clips') || '{}');
  return Object.keys(clips).map(function (k) { return clips[k]; })
    .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
}

/** kind: 'dim' | 'removed' */
function setMark(kind, id, on) {
  if (kind !== 'dim' && kind !== 'removed') throw new Error('bad kind');
  var p = PropertiesService.getUserProperties();
  var propKey = 'nb_' + kind;
  var map = JSON.parse(p.getProperty(propKey) || '{}');
  if (on) map[id] = 1; else delete map[id];
  p.setProperty(propKey, JSON.stringify(map));
  return true;
}

function blockSender(addr, on) {
  var p = PropertiesService.getUserProperties();
  var map = JSON.parse(p.getProperty('nb_blocked') || '{}');
  if (on) map[String(addr).toLowerCase()] = 1; else delete map[String(addr).toLowerCase()];
  p.setProperty('nb_blocked', JSON.stringify(map));
  return true;
}
