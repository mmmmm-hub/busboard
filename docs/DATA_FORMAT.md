# データ形式

時刻表のデータは `public/data/` の4つのJSONだけです(ほかに、運賃・乗り方などの案内を書く `about.md` を、あれば置けます。書き方は README の「案内ページ」)(便だけは Excel/CSV からも作れます: [CSV_FORMAT.md](CSV_FORMAT.md))。コードは触りません。
書き換えたら `npm run validate` で入力ミスを検査できます(`npm run build` や GitHub Actions でも自動で検査され、エラーがあると公開されません)。

実例は `examples/sample/`(汎用の小さなサンプル。時限は7つ)と `examples/chitose/`(千歳市の路線バスで実際に使っているビビバスのデータ、216便)にあります。

## site.json — サイトの設定

| キー | 内容 |
|---|---|
| `name` | サイト名(ヘッダーとタブに出る) |
| `subtitle` | ヘッダーの小さな補足 |
| `notice` | フッターの注意書き(「非公式です」など) |
| `footer` | フッターの最終行 |
| `directions` | 方向の一覧。`id`、`label`(例: 下り)、`sub`(例: 営業所方面)、`periodMode` |
| `defaults` | 方向ごとの、最初に選ばれる乗車地・降車地(`{ "down": { "from": "...", "to": "..." } }`) |
| `operators` | 運行会社。`{ "id": { "name": "北都", "color": "green" } }`。**運行会社が1社なら書かなくてよい**(便に `operator` が無ければ、画面にも列・バッジも出ない) |
| `periods` | 時限。下記 |
| `arrivalBufferMin` | 時限の開始・終了に持たせる余裕(分) |
| `calendar` | 休業期間・祝日・土曜の扱い。下記 |
| `timetableColumns` | 時刻表タブで**最初に表示する**停留所(方向ごと)。省略すると全停留所。利用者は画面の「表示するバス停」で好きに変更できる |
| `notices` | お知らせ(1件以上あると「お知らせ」タブが出る。不要なら空配列か削除)。`[{ "date": "2026-10-01", "title": "...", "body": "...", "important": true }]`(1件以上あると「お知らせ」タブが出る) |

### 時限(`periods`)

学校の時間割や、仕事のシフトなど、時間帯で便を探す必要がなければ、`periods` を丸ごと書かなくて構いません(時限の絞り込みは出ません)。

```json
"periods": {
  "enabled": true,
  "label": "限",
  "items": [
    { "id": 1, "start": "09:00", "end": "10:30" },
    { "id": 7, "start": "20:10", "end": "21:40" }
  ]
}
```

時限は何個でも増やせます(6限・7限・8限…)。`label` は「限」「時間目」「コマ」など自由です。

`directions[].periodMode` で、方向ごとに判定を決めます。

- `arrive_before_start`: 時限の開始に間に合う便(到着が `開始 − arrivalBufferMin` 以前)。登校向け。
- `depart_after_end`: 時限の終了後に乗れる便(出発が `終了 + arrivalBufferMin` 以降)。下校向け。

### カレンダー(`calendar`)

```json
"calendar": {
  "breaks": [{ "name": "夏季の特別ダイヤ", "from": "2026-08-03", "to": "2026-09-25" }],
  "holidays": ["2026-11-03", "2026-11-23"]
}
```

- `saturdayAs`: 土曜の扱い。**省略すると土曜は日曜・祝日と同じダイヤ**(平日 / 休日の2区分)です。土曜だけ別ダイヤの路線は `"saturday"` にして、便の `days` に `saturday` を使います。
- `breaks`: 長期休業や、夏季・年末年始などの特別ダイヤの期間。便ごとに、この期間中の扱いを決められます(下記 `breaks`)。
- `holidays`: 祝日。日曜と同じ扱いになります。

## stops.json — 停留所

```json
[
  { "id": "station", "name": "駅前", "platforms": { "A": "3番" } },
  { "id": "park", "name": "中央公園前", "shortName": "公園前" }
]
```

| キー | 内容 |
|---|---|
| `id` | 半角英数の一意なID |
| `name` | 表示名 |
| `shortName` | 時刻表タブの列見出し用の短い名前(省略可) |
| `platforms` | 路線IDごとののりば表示(省略可)。乗車地がこの停留所のときに表示される |
| `alias` | この停留所を選んだとき、便がこれらの停留所に停まるならその時刻も使う。「どちらでも」の仮想停留所や、同じ駅の別のりばをまとめるのに使う(省略可) |
| `hidden` | `true` で選択肢に出さない(`alias` で別の停留所にまとめたい別のりば用) |

## routes.json — 路線

```json
[
  {
    "id": "A",
    "name": "駅・営業所線",
    "color": "blue",
    "stops": {
      "down": ["station", "town", "hospital", "park", "depot"],
      "up": ["depot", "park", "hospital", "town", "station"]
    }
  }
]
```

`stops` は、**方向ごとの停留所の並び**です(停車する順)。便の時刻はこの順に並んでいる必要があります。路線は「経由の違い」ごとに分けても使えます(ビビバスは直通・空港経由・長都・南千歳を別路線にしています)。

`color`: `blue` `orange` `purple` `teal` `green` `red` `sky` `slate` のどれか。バッジの色になります。

## trips.json — 便

```json
{
  "id": "A-wd-up-01",
  "route": "A",
  "direction": "down",
  "days": "weekday",
  "breaks": "suspend",
  "operator": "hokuto",
  "from": "2026-10-01",
  "times": { "station": "07:00", "town": "07:05", "hospital": "07:09", "park": "07:15", "depot": "07:18" }
}
```

| キー | 内容 |
|---|---|
| `id` | 一意なID |
| `route` | `routes.json` の路線ID |
| `direction` | `site.json` の方向ID |
| `days` | `weekday`(平日) / `holiday`(土日祝。既定では土曜を含む) / `saturday`(`saturdayAs: "saturday"` のとき) / `everyday`。省略は `everyday` |
| `breaks` | 休業期間中の扱い。`run`(通常通り・既定) / `suspend`(運休) / `only`(休業中だけ運行) |
| `breakTimes` | 休業期間中だけ使う時刻(`times` と同じ形。省略可) |
| `operator` | `site.json` の `operators` のID(省略可) |
| `label` | 補足のバッジ(例: 「臨時」)(省略可) |
| `from` / `until` | この日以降 / この日までだけ運行(`YYYY-MM-DD`)。ダイヤ改正の切り替えに使う(省略可) |
| `times` | 停留所IDごとの時刻 `HH:MM`。深夜は `24:10` のように書けます。**停まらない停留所は書かない** |

### ダイヤ改正の入れ方

古い便に `"until": "2026-09-30"`、新しい便に `"from": "2026-10-01"` を付けて、両方を残します。過去の日付を調べたときも正しく出ます。

## 入力ミスの検査

`npm run validate` が次を検査します。

- 未定義の停留所・路線・方向・運行会社の参照
- 時刻が `HH:MM` 形式か、停留所の並び順で時刻が逆転していないか
- 便・停留所・路線のIDの重複
- 時限の重なり、日付の形式、`from` が `until` より後になっていないか
