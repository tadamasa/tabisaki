/**
 * 縁泉スプレッドシートの「場所」の記録を tabisaki に渡し、tabisaki で登録した資料のリンクを「links」シートに読み書きする Web API。
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
 */
const COLUMNS = ['event_id', 'ts', 'lat', 'lng', 'actant_type', 'actant_name', 'note', 'tags'];
const LINK_COLUMNS = ['link_id', 'created_at', 'target_type', 'target_id', 'target_name', 'muni_code', 'lat', 'lng', 'title', 'url', 'note'];

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  if (!authorized_(props, e && e.parameter && e.parameter.token)) return json_({ error: 'unauthorized' });
  const book = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  if (e.parameter.action === 'links') return json_({ links: readLinks_(book) });

  const sheet = book.getSheetByName('events');
  const values = sheet.getDataRange().getDisplayValues();
  const header = values[0];
  const index = COLUMNS.map((c) => header.indexOf(c));
  const typeCol = header.indexOf('actant_type');
  const events = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row[typeCol] !== '場所') continue;
    const item = {};
    COLUMNS.forEach((c, i) => (item[c] = index[i] >= 0 ? row[index[i]] : null));
    events.push(item);
  }
  return json_({ updatedAt: new Date().toISOString(), events: events });
}

// 資料の登録と削除。本文は JSON: { token, action: 'addLink', link: {...} } または { token, action: 'deleteLink', link_id }
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
