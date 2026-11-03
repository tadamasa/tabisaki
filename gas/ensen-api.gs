/**
 * 縁泉スプレッドシートの「場所」の記録を（spot_fixes で直した位置を重ねて）tabisaki に渡し、tabisaki で登録した資料のリンクを「links」シートに、保存した行程を「plans」シートに読み書きする Web API。
 *
 * 使い方（縁泉本体とは別の Apps Script プロジェクトとして作る）
 * 1. https://script.google.com で新しいプロジェクトを作り、このファイルの中身を貼る
 * 2. プロジェクトの設定 → スクリプト プロパティに次を追加する
 *      SHEET_ID  縁泉スプレッドシートの ID（URL の /d/ と /edit の間）
 *      TOKEN     推測されにくい長い文字列（tabisaki の ENSEN_GAS_TOKEN と同じ値）
 * 3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *      次のユーザーとして実行: 自分 / アクセスできるユーザー: 全員
 * 4. 表示された URL（.../exec）を tabisaki の ENSEN_GAS_URL に設定する
 *
 * このファイルを差し替えたら「デプロイを管理 → 編集 → バージョン: 新バージョン」で同じ URL のまま更新する。
 * TOKEN が合わない呼び出しには何も返さないので、URL が知られても記録は読まれない。
 *
 * links シート（はじめて資料を登録したときに作る）。縁泉アプリからも同じ列で読み書きできる
 *   link_id      一意の id
 *   created_at   登録日時（ISO 8601）
 *   target_type  town（市町村）または place（社・館・訪問した場所など）
 *   target_id    town なら市町村コード（5桁）、place なら OpenStreetMap の id（例 node/123）か縁泉の event_id
 *   target_name  町や場所の名前
 *   muni_code    その場所がある市町村コード（5桁）
 *   lat, lng     場所の位置（町なら空でよい）
 *   title        資料の名前（例「吉野町観光パンフレット」）
 *   url          資料の URL（Google ドライブの共有リンクなど）
 *   note         メモ
 *
 * plans シート（はじめて行程を保存したときに作る）。tabisaki で組んだ行程を、あとで開いて直せるように置く
 *   plan_id      一意の id
 *   updated_at   保存した日時（ISO 8601）
 *   title        行程の名前
 *   area_id      地帯の id
 *   area_label   地帯の名前
 *   trip_date    旅の日（YYYY-MM-DD）
 *   mode         移動手段（car / train / bike / walk / rent）
 *   data         行程の中身（JSON。地点・順番・出発時刻・出発地）
 */
const COLUMNS = ['event_id', 'ts', 'lat', 'lng', 'actant_type', 'actant_name', 'actant_id', 'note', 'tags'];
const PLAN_COLUMNS = ['plan_id', 'updated_at', 'title', 'area_id', 'area_label', 'trip_date', 'mode', 'data'];
const LINK_COLUMNS = ['link_id', 'created_at', 'target_type', 'target_id', 'target_name', 'muni_code', 'lat', 'lng', 'title', 'url', 'note'];

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  if (!authorized_(props, e && e.parameter && e.parameter.token)) return json_({ error: 'unauthorized' });
  const book = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  if (e.parameter.action === 'links') return json_({ links: readLinks_(book) });
  if (e.parameter.action === 'plans') return json_({ plans: readRows_(book, 'plans', PLAN_COLUMNS) });

  const sheet = book.getSheetByName('events');
  const values = sheet.getDataRange().getDisplayValues();
  const header = values[0];
  const index = COLUMNS.map((c) => header.indexOf(c));
  const typeCol = header.indexOf('actant_type');
  const fixes = latestSpotFixes_(book);
  const events = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row[typeCol] !== '場所') continue;
    const item = {};
    COLUMNS.forEach((c, i) => (item[c] = index[i] >= 0 ? row[index[i]] : null));
    const fix = item.actant_id ? fixes[item.actant_id] : undefined;
    if (fix && fix.status === 'hide') continue; // 位置不明にした場所は返さない
    if (fix && fix.status === 'move') {
      item.lat = String(fix.lat);
      item.lng = String(fix.lng);
    }
    events.push(item);
  }
  return json_({ updatedAt: new Date().toISOString(), events: events });
}

/*
 * 縁泉アプリで直したスポットの位置（spot_fixes シート）。読むだけで、縁泉シートには書かない。
 * 規則は縁泉アプリ（ensen-home/js/ensen.js の latestSpotFixes / applySpotFixes）と同じ:
 *   同じ actant_id では ts がいちばん新しい1行だけが効く（ts は文字列で比べ、同じ ts なら後に追記された行）。
 *   ts の書式は縁泉ハブが yyyy-MM-dd'T'HH:mm:ss+09:00 にそろえて書く約束（ensen-home/hub/README.md）。
 *   move で lat/lng があれば位置を置き換え、hide なら返さない、ok / undo は events の座標のまま。
 * 返すのは { actant_id: { status, lat, lng } }。シートがなければ空。
 */
const SPOT_STATUS = ['move', 'hide', 'ok', 'undo'];
const ENSEN_TIMEZONE = 'Asia/Tokyo';

function latestSpotFixes_(book) {
  const sheet = book.getSheetByName('spot_fixes');
  if (!sheet || sheet.getLastRow() < 2) return {};
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(String);
  const col = {};
  ['ts', 'actant_id', 'lat', 'lng', 'status'].forEach((c) => (col[c] = header.indexOf(c)));
  if (col.actant_id < 0 || col.status < 0) return {};
  const latest = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const aid = String(row[col.actant_id] == null ? '' : row[col.actant_id]);
    const status = String(row[col.status] == null ? '' : row[col.status]);
    if (!aid || SPOT_STATUS.indexOf(status) < 0) continue;
    const fix = { ts: isoString_(col.ts >= 0 ? row[col.ts] : ''), status: status, lat: num_(row[col.lat]), lng: num_(row[col.lng]) };
    const cur = latest[aid];
    if (!cur || fix.ts >= cur.ts) latest[aid] = fix;
  }
  Object.keys(latest).forEach((aid) => {
    const f = latest[aid];
    // undo は消す。lat/lng のない move は何もしない（縁泉アプリと同じ）
    if (f.status === 'undo' || (f.status === 'move' && (f.lat === null || f.lng === null))) delete latest[aid];
  });
  return latest;
}

// 縁泉ハブ（ensen-home/hub/Code.gs の isoString_）と同じ形の文字列にして、ts を文字列で比べられるようにする
function isoString_(v) {
  return v instanceof Date ? Utilities.formatDate(v, ENSEN_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX") : String(v == null ? '' : v);
}

function num_(v) {
  return v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
}

// 資料の登録と削除。本文は JSON: { token, action: 'addLink', link: {...} } または { token, action: 'deleteLink', link_id }
// 行程の保存と削除: { token, action: 'savePlan', plan: {...} }（plan_id が同じ行があれば上書き）または { token, action: 'deletePlan', plan_id }
function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: 'bad request' });
  }
  if (!authorized_(props, body.token)) return json_({ error: 'unauthorized' });
  const book = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (body.action === 'savePlan') return json_({ plan: savePlan_(book, body.plan || {}) });
    if (body.action === 'deletePlan') {
      const sheet = book.getSheetByName('plans');
      if (sheet && deleteRowById_(sheet, body.plan_id)) return json_({ deleted: body.plan_id });
      return json_({ error: 'not found' });
    }
    const sheet = linkSheet_(book);
    if (body.action === 'addLink') {
      const link = body.link || {};
      if (!/^https?:\/\//.test(String(link.url || ''))) return json_({ error: 'url が必要です' });
      link.link_id = Utilities.getUuid();
      link.created_at = new Date().toISOString();
      sheet.appendRow(LINK_COLUMNS.map((c) => (link[c] === undefined || link[c] === null ? '' : String(link[c]))));
      return json_({ link: link });
    }
    if (body.action === 'deleteLink') {
      const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
      for (let r = ids.length - 1; r >= 1; r--) {
        if (ids[r][0] === body.link_id) {
          sheet.deleteRow(r + 1);
          return json_({ deleted: body.link_id });
        }
      }
      return json_({ error: 'not found' });
    }
    return json_({ error: 'unknown action' });
  } finally {
    lock.releaseLock();
  }
}

function savePlan_(book, plan) {
  let sheet = book.getSheetByName('plans');
  if (!sheet) {
    sheet = book.insertSheet('plans');
    sheet.appendRow(PLAN_COLUMNS);
    sheet.setFrozenRows(1);
  }
  if (!plan.plan_id) plan.plan_id = Utilities.getUuid();
  plan.updated_at = new Date().toISOString();
  const row = PLAN_COLUMNS.map((c) => (plan[c] === undefined || plan[c] === null ? '' : String(plan[c])));
  const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (let r = 1; r < ids.length; r++) {
    if (ids[r][0] === plan.plan_id) {
      sheet.getRange(r + 1, 1, 1, row.length).setValues([row]);
      return plan;
    }
  }
  sheet.appendRow(row);
  return plan;
}

function deleteRowById_(sheet, id) {
  const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (let r = ids.length - 1; r >= 1; r--) {
    if (ids[r][0] === id) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

function readRows_(book, name, columns) {
  const sheet = book.getSheetByName(name);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(String);
  const index = columns.map((c) => header.indexOf(c));
  return values.slice(1).map((row) => {
    const item = {};
    columns.forEach((c, i) => (item[c] = index[i] >= 0 ? String(row[index[i]] == null ? '' : row[index[i]]) : ''));
    return item;
  });
}

function authorized_(props, given) {
  const token = props.getProperty('TOKEN');
  return !!token && given === token;
}

function linkSheet_(book) {
  let sheet = book.getSheetByName('links');
  if (!sheet) {
    sheet = book.insertSheet('links');
    sheet.appendRow(LINK_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readLinks_(book) {
  const sheet = book.getSheetByName('links');
  if (!sheet) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const header = values[0];
  const index = LINK_COLUMNS.map((c) => header.indexOf(c));
  const links = [];
  for (let r = 1; r < values.length; r++) {
    const item = {};
    LINK_COLUMNS.forEach((c, i) => (item[c] = index[i] >= 0 ? values[r][index[i]] : ''));
    if (item.url) links.push(item);
  }
  return links;
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
