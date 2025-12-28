const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

// 💡 publicフォルダ内のHTMLを配信
app.use(express.static(path.join(__dirname, 'public')));

// DB接続設定（環境変数を使用）
const pool = mysql.createPool({
    host: process.env.DB_HOST || "db",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "rootpass",
    database: process.env.DB_NAME || "vr_rental",
    port: process.env.DB_PORT || 3306, // ポート番号も環境変数から読み込む
    charset: "utf8mb4",
    ssl: { rejectUnauthorized: false }, // 💡 クラウドDB接続に必須の設定
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
// ==========================================
// 1. 新規登録 API
// ==========================================
app.post("/api/register", (req, res) => {
    const { email, name } = req.body;
    pool.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ error: "DBエラー" });
        if (results.length > 0) {
            return res.status(200).json({ userId: results[0].id, name: results[0].name });
        }
        pool.query('INSERT INTO users (email, name) VALUES (?, ?)', [email, name], (err, result) => {
            if (err) return res.status(500).json({ error: "登録失敗" });
            res.status(201).json({ userId: result.insertId, name: name });
        });
    });
});

// ==========================================
// 2. ログイン API
// ==========================================
app.post("/api/login", (req, res) => {
    const { email } = req.body;
    pool.query('SELECT id, name FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ error: "DBエラー" });
        if (results.length === 0) return res.status(401).json({ error: "ユーザーが見つかりません" });
        res.json({ userId: results[0].id, name: results[0].name });
    });
});

// ==========================================
// 3. 在庫状況取得 API（💡 これが不足していました）
// ==========================================
app.get("/api/vr-status", (req, res) => {
    const sql = "SELECT vr_id FROM reservations WHERE end_at > NOW()";
    pool.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "在庫取得失敗" });
        }
        const rentedIds = results.map(r => r.vr_id);
        const totalVrs = 50;
        const availableIds = [];
        for (let i = 1; i <= totalVrs; i++) {
            if (!rentedIds.includes(i)) availableIds.push(i);
        }
        res.json({
            availableCount: availableIds.length,
            rentedCount: rentedIds.length,
            nextAvailableId: availableIds[0] || null
        });
    });
});

// ==========================================
// 4. 予約実行 API
// ==========================================
app.post("/api/reserve", (req, res) => {
    const { user_id, vr_id, start_at, end_at } = req.body;
    const sql = `INSERT INTO reservations (user_id, vr_id, start_at, end_at) VALUES (?, ?, ?, ?)`;
    pool.query(sql, [user_id, vr_id, start_at, end_at], (err, result) => {
        if (err) return res.status(500).json({ error: "予約失敗" });
        res.status(201).json({ message: "予約完了", vr_id: vr_id });
    });
});

// ==========================================
// 5. 返却 API (貸出中の予約を今すぐ終了させる)
// ==========================================
// 💡 【重要】ここが不足していた「返却 API」です
app.post("/api/return", (req, res) => {
    const { vr_id } = req.body;
    console.log("返却要求を受信 ID:", vr_id);

    // 貸出中（end_at が未来）のデータを検索して、終了時間を「今」に書き換える
    const sql = `
        UPDATE reservations 
        SET end_at = NOW() 
        WHERE vr_id = ? AND end_at > NOW() 
        ORDER BY start_at DESC LIMIT 1
    `;

    pool.query(sql, [vr_id], (err, result) => {
        if (err) {
            console.error("DBエラー:", err);
            return res.status(500).json({ error: "返却に失敗しました" });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "そのIDのVRは現在貸出中ではありません" });
        }
        res.json({ message: `VR ID: ${vr_id} の返却が完了しました。` });
    });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running on port ${PORT}`);
});