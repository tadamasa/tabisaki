/**
 * 縁泉スプレッドシートの「場所」の記録を tabisaki に渡す Web API。
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
 * TOKEN が合わない呼び出しには何も返さないので、URL が知られても記録は読まれない。
 */
const COLUMNS = ['event_id', 'ts', 'lat', 'lng', 'actant_type', 'actant_name', 'note', 'tags'];

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TOKEN');
  if (!token || !e || !e.parameter || e.parameter.token !== token) {
    return json_({ error: 'unauthorized' });
  }
  const sheet = SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getSheetByName('events');
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

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
