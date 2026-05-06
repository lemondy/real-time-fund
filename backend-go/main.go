package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	Port               string
	DBURL              string
	JWTSecret          string
	AllowedOrigin      string
	WechatAppID        string
	WechatAppSecret    string
	WechatCode2Session string
}

type App struct {
	cfg Config
	db  *pgxpool.Pool
}

type Claims struct {
	OpenID string `json:"openid"`
	Exp    int64  `json:"exp"`
	Iat    int64  `json:"iat"`
}

type APIError struct {
	Message string `json:"message"`
}

type LoginRequest struct {
	Code string `json:"code"`
}

type LoginResponse struct {
	Success    bool   `json:"success"`
	Token      string `json:"token"`
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key,omitempty"`
	Message    string `json:"message,omitempty"`
}

type UserInfo struct {
	NickName  string `json:"nickName"`
	AvatarURL string `json:"avatarUrl"`
}

type FundPayload struct {
	FundCode   string `json:"fundCode"`
	FundName   string `json:"fundName"`
	Favorite   bool   `json:"favorite"`
	GroupID    string `json:"groupId"`
	SortOrder  int    `json:"sortOrder"`
	AddTime    *int64 `json:"addTime"`
	UpdateTime *int64 `json:"updateTime"`
}

type HoldingPayload struct {
	FundCode    string   `json:"fundCode"`
	Mode        string   `json:"mode"`
	Amount      *float64 `json:"amount"`
	Shares      *float64 `json:"shares"`
	CostPrice   *float64 `json:"costPrice"`
	FirstBuyDay *string  `json:"firstBuyDate"`
	UpdatedAt   *int64   `json:"updatedAt"`
}

type SummaryPayload struct {
	FundCount        int     `json:"fundCount"`
	FavoriteCount    int     `json:"favoriteCount"`
	HoldingCount     int     `json:"holdingCount"`
	TotalCost        float64 `json:"totalCost"`
	TotalMarketValue float64 `json:"totalMarketValue"`
	TodayPnl         float64 `json:"todayPnl"`
	TotalPnl         float64 `json:"totalPnl"`
	TotalPnlRate     float64 `json:"totalPnlRate"`
}

type FullSyncRequest struct {
	OpenID       string           `json:"openid"`
	UserInfo     *UserInfo        `json:"userInfo"`
	Funds        []FundPayload    `json:"funds"`
	Holdings     []HoldingPayload `json:"holdings"`
	Summary      *SummaryPayload  `json:"summary"`
	ClientSyncAt *int64           `json:"clientSyncAt"`
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("load config failed: %v", err)
	}

	db, err := pgxpool.New(context.Background(), cfg.DBURL)
	if err != nil {
		log.Fatalf("connect db failed: %v", err)
	}
	defer db.Close()

	app := &App{cfg: cfg, db: db}
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", app.healthz)
	mux.HandleFunc("/api/wx-login", app.wxLogin)
	mux.HandleFunc("/api/sync/full", app.auth(app.syncFull))
	mux.HandleFunc("/api/sync/funds/upsert", app.auth(app.upsertFund))
	mux.HandleFunc("/api/sync/funds/", app.auth(app.deleteFund))
	mux.HandleFunc("/api/sync/holdings/upsert", app.auth(app.upsertHolding))
	mux.HandleFunc("/api/sync/holdings/", app.auth(app.deleteHolding))
	mux.HandleFunc("/api/sync/portfolio/upsert", app.auth(app.upsertPortfolio))

	handler := app.cors(mux)

	addr := ":" + cfg.Port
	log.Printf("go backend listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func loadConfig() (Config, error) {
	cfg := Config{
		Port:               getenv("PORT", "8080"),
		DBURL:              os.Getenv("SUPABASE_DB_URL"),
		JWTSecret:          os.Getenv("JWT_SECRET"),
		AllowedOrigin:      getenv("ALLOWED_ORIGIN", "*"),
		WechatAppID:        os.Getenv("WECHAT_APPID"),
		WechatAppSecret:    os.Getenv("WECHAT_APPSECRET"),
		WechatCode2Session: getenv("WECHAT_CODE2SESSION_URL", "https://api.weixin.qq.com/sns/jscode2session"),
	}
	if cfg.DBURL == "" {
		return cfg, errors.New("SUPABASE_DB_URL is required")
	}
	if cfg.JWTSecret == "" {
		return cfg, errors.New("JWT_SECRET is required")
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func (a *App) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", a.cfg.AllowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) wxLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIError{Message: "method not allowed"})
		return
	}

	var req LoginRequest
	if err := readJSON(r.Body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIError{Message: "invalid request body"})
		return
	}
	if strings.TrimSpace(req.Code) == "" {
		writeJSON(w, http.StatusBadRequest, APIError{Message: "code is required"})
		return
	}

	openid, sessionKey, err := a.exchangeCode(req.Code)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, LoginResponse{Success: false, Message: err.Error()})
		return
	}

	token, err := signToken(Claims{
		OpenID: openid,
		Iat:    time.Now().Unix(),
		Exp:    time.Now().Add(7 * 24 * time.Hour).Unix(),
	}, a.cfg.JWTSecret)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, LoginResponse{Success: false, Message: "failed to sign token"})
		return
	}

	writeJSON(w, http.StatusOK, LoginResponse{
		Success:    true,
		Token:      token,
		OpenID:     openid,
		SessionKey: sessionKey,
	})
}

func (a *App) exchangeCode(code string) (string, string, error) {
	if a.cfg.WechatAppID == "" || a.cfg.WechatAppSecret == "" {
		mockOpenID := "dev_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + strconv.Itoa(rand.IntN(9999))
		return mockOpenID, "", nil
	}

	u, _ := url.Parse(a.cfg.WechatCode2Session)
	q := u.Query()
	q.Set("appid", a.cfg.WechatAppID)
	q.Set("secret", a.cfg.WechatAppSecret)
	q.Set("js_code", code)
	q.Set("grant_type", "authorization_code")
	u.RawQuery = q.Encode()

	resp, err := http.Get(u.String())
	if err != nil {
		return "", "", fmt.Errorf("call wechat api failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var wechatResp struct {
		OpenID     string `json:"openid"`
		SessionKey string `json:"session_key"`
		ErrCode    int    `json:"errcode"`
		ErrMsg     string `json:"errmsg"`
	}
	if err := json.Unmarshal(body, &wechatResp); err != nil {
		return "", "", errors.New("wechat response parse failed")
	}
	if wechatResp.ErrCode != 0 {
		return "", "", fmt.Errorf("wechat error: %s (%d)", wechatResp.ErrMsg, wechatResp.ErrCode)
	}
	if wechatResp.OpenID == "" {
		return "", "", errors.New("wechat openid is empty")
	}
	return wechatResp.OpenID, wechatResp.SessionKey, nil
}

func (a *App) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authz := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(authz, "Bearer ") {
			writeJSON(w, http.StatusUnauthorized, APIError{Message: "missing bearer token"})
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
		claims, err := parseToken(token, a.cfg.JWTSecret)
		if err != nil {
			// 兼容历史 token=openid 场景
			if token == "" {
				writeJSON(w, http.StatusUnauthorized, APIError{Message: "invalid token"})
				return
			}
			claims = Claims{OpenID: token}
		}
		ctx := context.WithValue(r.Context(), "openid", claims.OpenID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func getOpenID(ctx context.Context) string {
	if v, ok := ctx.Value("openid").(string); ok {
		return v
	}
	return ""
}

func (a *App) syncFull(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		a.syncFullUp(w, r)
	case http.MethodGet:
		a.syncFullDown(w, r)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, APIError{Message: "method not allowed"})
	}
}

func (a *App) syncFullUp(w http.ResponseWriter, r *http.Request) {
	var req FullSyncRequest
	if err := readJSON(r.Body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIError{Message: "invalid request body"})
		return
	}
	tokenOpenID := getOpenID(r.Context())
	if err := ensureOpenID(tokenOpenID, req.OpenID); err != nil {
		writeJSON(w, http.StatusForbidden, APIError{Message: err.Error()})
		return
	}

	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "begin tx failed"})
		return
	}
	defer tx.Rollback(ctx)

	if req.UserInfo != nil {
		_, err = tx.Exec(ctx, `
			insert into public.user_profiles (openid, nickname, avatar_url)
			values ($1, $2, $3)
			on conflict (openid)
			do update set nickname = excluded.nickname, avatar_url = excluded.avatar_url
		`, req.OpenID, req.UserInfo.NickName, req.UserInfo.AvatarURL)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, APIError{Message: "upsert profile failed"})
			return
		}
	}

	for _, f := range req.Funds {
		_, err = tx.Exec(ctx, `
			insert into public.user_funds
				(openid, fund_code, fund_name, favorite, group_id, sort_order, add_time, client_update_time)
			values
				($1, $2, $3, $4, $5, $6, $7, $8)
			on conflict (openid, fund_code)
			do update set
				fund_name = excluded.fund_name,
				favorite = excluded.favorite,
				group_id = excluded.group_id,
				sort_order = excluded.sort_order,
				add_time = excluded.add_time,
				client_update_time = excluded.client_update_time
			where
				public.user_funds.client_update_time is null
				or excluded.client_update_time is null
				or excluded.client_update_time >= public.user_funds.client_update_time
		`, req.OpenID, f.FundCode, f.FundName, f.Favorite, defaultStr(f.GroupID, "default"), f.SortOrder, f.AddTime, f.UpdateTime)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, APIError{Message: "upsert funds failed"})
			return
		}
	}

	for _, h := range req.Holdings {
		_, err = tx.Exec(ctx, `
			insert into public.user_holdings
				(openid, fund_code, mode, amount, shares, cost_price, first_buy_date, client_update_time)
			values
				($1, $2, $3, $4, $5, $6, $7, $8)
			on conflict (openid, fund_code)
			do update set
				mode = excluded.mode,
				amount = excluded.amount,
				shares = excluded.shares,
				cost_price = excluded.cost_price,
				first_buy_date = excluded.first_buy_date,
				client_update_time = excluded.client_update_time
			where
				public.user_holdings.client_update_time is null
				or excluded.client_update_time is null
				or excluded.client_update_time >= public.user_holdings.client_update_time
		`, req.OpenID, h.FundCode, defaultStr(h.Mode, "amount"), h.Amount, h.Shares, h.CostPrice, h.FirstBuyDay, h.UpdatedAt)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, APIError{Message: "upsert holdings failed"})
			return
		}
	}

	if req.Summary != nil {
		_, err = tx.Exec(ctx, `
			insert into public.user_portfolio_summary
				(openid, fund_count, favorite_count, holding_count, total_cost, total_market_value, today_pnl, total_pnl, total_pnl_rate, client_sync_at)
			values
				($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			on conflict (openid)
			do update set
				fund_count = excluded.fund_count,
				favorite_count = excluded.favorite_count,
				holding_count = excluded.holding_count,
				total_cost = excluded.total_cost,
				total_market_value = excluded.total_market_value,
				today_pnl = excluded.today_pnl,
				total_pnl = excluded.total_pnl,
				total_pnl_rate = excluded.total_pnl_rate,
				client_sync_at = excluded.client_sync_at,
				updated_at = now()
		`, req.OpenID, req.Summary.FundCount, req.Summary.FavoriteCount, req.Summary.HoldingCount, req.Summary.TotalCost, req.Summary.TotalMarketValue, req.Summary.TodayPnl, req.Summary.TotalPnl, req.Summary.TotalPnlRate, req.ClientSyncAt)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, APIError{Message: "upsert summary failed"})
			return
		}
	}

	payloadSize := len(req.Funds) + len(req.Holdings)
	_, _ = tx.Exec(ctx, `
		insert into public.sync_logs (openid, sync_type, payload_size, success, message)
		values ($1, 'full', $2, true, 'ok')
	`, req.OpenID, payloadSize)

	if err = tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "commit failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true, "message": "sync ok"})
}

func (a *App) syncFullDown(w http.ResponseWriter, r *http.Request) {
	queryOpenID := strings.TrimSpace(r.URL.Query().Get("openid"))
	tokenOpenID := getOpenID(r.Context())
	if err := ensureOpenID(tokenOpenID, queryOpenID); err != nil {
		writeJSON(w, http.StatusForbidden, APIError{Message: err.Error()})
		return
	}

	ctx := r.Context()
	fundsRows, err := a.db.Query(ctx, `
		select fund_code, fund_name, favorite, group_id, sort_order, add_time, client_update_time, updated_at
		from public.user_funds
		where openid = $1
		order by sort_order asc, id asc
	`, queryOpenID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "query funds failed"})
		return
	}
	defer fundsRows.Close()

	funds := make([]map[string]any, 0)
	for fundsRows.Next() {
		var fundCode, fundName, groupID string
		var favorite bool
		var sortOrder int
		var addTime, updateTime sql.NullInt64
		var updatedAt time.Time
		if err := fundsRows.Scan(&fundCode, &fundName, &favorite, &groupID, &sortOrder, &addTime, &updateTime, &updatedAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, APIError{Message: "scan funds failed"})
			return
		}
		funds = append(funds, map[string]any{
			"fund_code":   fundCode,
			"fund_name":   fundName,
			"favorite":    favorite,
			"group_id":    groupID,
			"sort_order":  sortOrder,
			"add_time":    nullInt64(addTime),
			"update_time": nullInt64(updateTime),
			"updated_at":  updatedAt.Format(time.RFC3339),
		})
	}

	holdingRows, err := a.db.Query(ctx, `
		select fund_code, mode, amount, shares, cost_price, first_buy_date, client_update_time, updated_at
		from public.user_holdings
		where openid = $1
		order by id asc
	`, queryOpenID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "query holdings failed"})
		return
	}
	defer holdingRows.Close()

	holdings := make([]map[string]any, 0)
	for holdingRows.Next() {
		var fundCode, mode string
		var amount, shares, costPrice sql.NullFloat64
		var firstBuyDate sql.NullString
		var updateTime sql.NullInt64
		var updatedAt time.Time
		if err := holdingRows.Scan(&fundCode, &mode, &amount, &shares, &costPrice, &firstBuyDate, &updateTime, &updatedAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, APIError{Message: "scan holdings failed"})
			return
		}
		holdings = append(holdings, map[string]any{
			"fund_code":      fundCode,
			"mode":           mode,
			"amount":         nullFloat64(amount),
			"shares":         nullFloat64(shares),
			"cost_price":     nullFloat64(costPrice),
			"first_buy_date": nullString(firstBuyDate),
			"update_time":    nullInt64(updateTime),
			"updated_at":     updatedAt.Format(time.RFC3339),
		})
	}

	var summary map[string]any
	var fundCount, favoriteCount, holdingCount int
	var totalCost, totalMarketValue, todayPnl, totalPnl, totalPnlRate float64
	var snapshotDate time.Time
	var clientSyncAt sql.NullInt64
	err = a.db.QueryRow(ctx, `
		select fund_count, favorite_count, holding_count, total_cost, total_market_value, today_pnl, total_pnl, total_pnl_rate, snapshot_date, client_sync_at, updated_at
		from public.user_portfolio_summary
		where openid = $1
	`, queryOpenID).Scan(&fundCount, &favoriteCount, &holdingCount, &totalCost, &totalMarketValue, &todayPnl, &totalPnl, &totalPnlRate, &snapshotDate, &clientSyncAt, new(time.Time))
	if err == nil {
		summary = map[string]any{
			"fund_count":         fundCount,
			"favorite_count":     favoriteCount,
			"holding_count":      holdingCount,
			"total_cost":         totalCost,
			"total_market_value": totalMarketValue,
			"today_pnl":          todayPnl,
			"total_pnl":          totalPnl,
			"total_pnl_rate":     totalPnlRate,
			"snapshot_date":      snapshotDate.Format("2006-01-02"),
			"client_sync_at":     nullInt64(clientSyncAt),
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "query summary failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"funds":    funds,
		"holdings": holdings,
		"summary":  summary,
	})
}

func (a *App) upsertFund(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIError{Message: "method not allowed"})
		return
	}
	var req struct {
		OpenID string      `json:"openid"`
		Fund   FundPayload `json:"fund"`
	}
	if err := readJSON(r.Body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIError{Message: "invalid request body"})
		return
	}
	if err := ensureOpenID(getOpenID(r.Context()), req.OpenID); err != nil {
		writeJSON(w, http.StatusForbidden, APIError{Message: err.Error()})
		return
	}
	_, err := a.db.Exec(r.Context(), `
		insert into public.user_funds
			(openid, fund_code, fund_name, favorite, group_id, sort_order, add_time, client_update_time)
		values
			($1, $2, $3, $4, $5, $6, $7, $8)
		on conflict (openid, fund_code)
		do update set
			fund_name = excluded.fund_name,
			favorite = excluded.favorite,
			group_id = excluded.group_id,
			sort_order = excluded.sort_order,
			add_time = excluded.add_time,
			client_update_time = excluded.client_update_time
	`, req.OpenID, req.Fund.FundCode, req.Fund.FundName, req.Fund.Favorite, defaultStr(req.Fund.GroupID, "default"), req.Fund.SortOrder, req.Fund.AddTime, req.Fund.UpdateTime)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "upsert fund failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) deleteFund(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, APIError{Message: "method not allowed"})
		return
	}
	fundCode := strings.TrimPrefix(r.URL.Path, "/api/sync/funds/")
	openid := strings.TrimSpace(r.URL.Query().Get("openid"))
	if fundCode == "" || openid == "" {
		writeJSON(w, http.StatusBadRequest, APIError{Message: "missing fundCode/openid"})
		return
	}
	if err := ensureOpenID(getOpenID(r.Context()), openid); err != nil {
		writeJSON(w, http.StatusForbidden, APIError{Message: err.Error()})
		return
	}
	_, err := a.db.Exec(r.Context(), `delete from public.user_funds where openid = $1 and fund_code = $2`, openid, fundCode)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "delete fund failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) upsertHolding(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIError{Message: "method not allowed"})
		return
	}
	var req struct {
		OpenID  string         `json:"openid"`
		Holding HoldingPayload `json:"holding"`
	}
	if err := readJSON(r.Body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIError{Message: "invalid request body"})
		return
	}
	if err := ensureOpenID(getOpenID(r.Context()), req.OpenID); err != nil {
		writeJSON(w, http.StatusForbidden, APIError{Message: err.Error()})
		return
	}
	_, err := a.db.Exec(r.Context(), `
		insert into public.user_holdings
			(openid, fund_code, mode, amount, shares, cost_price, first_buy_date, client_update_time)
		values
			($1, $2, $3, $4, $5, $6, $7, $8)
		on conflict (openid, fund_code)
		do update set
			mode = excluded.mode,
			amount = excluded.amount,
			shares = excluded.shares,
			cost_price = excluded.cost_price,
			first_buy_date = excluded.first_buy_date,
			client_update_time = excluded.client_update_time
	`, req.OpenID, req.Holding.FundCode, defaultStr(req.Holding.Mode, "amount"), req.Holding.Amount, req.Holding.Shares, req.Holding.CostPrice, req.Holding.FirstBuyDay, req.Holding.UpdatedAt)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "upsert holding failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) deleteHolding(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, APIError{Message: "method not allowed"})
		return
	}
	fundCode := strings.TrimPrefix(r.URL.Path, "/api/sync/holdings/")
	openid := strings.TrimSpace(r.URL.Query().Get("openid"))
	if fundCode == "" || openid == "" {
		writeJSON(w, http.StatusBadRequest, APIError{Message: "missing fundCode/openid"})
		return
	}
	if err := ensureOpenID(getOpenID(r.Context()), openid); err != nil {
		writeJSON(w, http.StatusForbidden, APIError{Message: err.Error()})
		return
	}
	_, err := a.db.Exec(r.Context(), `delete from public.user_holdings where openid = $1 and fund_code = $2`, openid, fundCode)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "delete holding failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) upsertPortfolio(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIError{Message: "method not allowed"})
		return
	}
	var req struct {
		OpenID  string         `json:"openid"`
		Summary SummaryPayload `json:"summary"`
	}
	if err := readJSON(r.Body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIError{Message: "invalid request body"})
		return
	}
	if err := ensureOpenID(getOpenID(r.Context()), req.OpenID); err != nil {
		writeJSON(w, http.StatusForbidden, APIError{Message: err.Error()})
		return
	}
	_, err := a.db.Exec(r.Context(), `
		insert into public.user_portfolio_summary
			(openid, fund_count, favorite_count, holding_count, total_cost, total_market_value, today_pnl, total_pnl, total_pnl_rate, client_sync_at)
		values
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		on conflict (openid)
		do update set
			fund_count = excluded.fund_count,
			favorite_count = excluded.favorite_count,
			holding_count = excluded.holding_count,
			total_cost = excluded.total_cost,
			total_market_value = excluded.total_market_value,
			today_pnl = excluded.today_pnl,
			total_pnl = excluded.total_pnl,
			total_pnl_rate = excluded.total_pnl_rate,
			client_sync_at = excluded.client_sync_at,
			updated_at = now()
	`, req.OpenID, req.Summary.FundCount, req.Summary.FavoriteCount, req.Summary.HoldingCount, req.Summary.TotalCost, req.Summary.TotalMarketValue, req.Summary.TodayPnl, req.Summary.TotalPnl, req.Summary.TotalPnlRate, time.Now().UnixMilli())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIError{Message: "upsert summary failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func defaultStr(s, d string) string {
	if strings.TrimSpace(s) == "" {
		return d
	}
	return s
}

func ensureOpenID(tokenOpenID, requestOpenID string) error {
	if strings.TrimSpace(requestOpenID) == "" {
		return errors.New("openid is required")
	}
	if tokenOpenID == "" {
		return errors.New("unauthorized openid")
	}
	if tokenOpenID != requestOpenID {
		return errors.New("openid mismatch")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func readJSON(r io.Reader, v any) error {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func nullInt64(v sql.NullInt64) any {
	if v.Valid {
		return v.Int64
	}
	return nil
}

func nullFloat64(v sql.NullFloat64) any {
	if v.Valid {
		return v.Float64
	}
	return nil
}

func nullString(v sql.NullString) any {
	if v.Valid {
		return v.String
	}
	return nil
}

func signToken(c Claims, secret string) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payloadBytes, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	input := header + "." + payload
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(input))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return input + "." + signature, nil
}

func parseToken(token, secret string) (Claims, error) {
	var claims Claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return claims, errors.New("invalid token")
	}
	input := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(input))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(parts[2]), []byte(expected)) {
		return claims, errors.New("invalid signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return claims, errors.New("invalid payload")
	}
	if err = json.Unmarshal(payload, &claims); err != nil {
		return claims, errors.New("invalid claims")
	}
	if claims.OpenID == "" {
		return claims, errors.New("missing openid")
	}
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return claims, errors.New("token expired")
	}
	return claims, nil
}
