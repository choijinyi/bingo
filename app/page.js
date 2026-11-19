"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";
import { makeGameCode, normalizeName } from "../lib/bingo";

const STORAGE_KEY = "name-bingo-host-code";

export default function HostPage() {
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");

  // 게임 만들기 폼 상태
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // 진행 화면 상태
  const [qrUrl, setQrUrl] = useState("");
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [copied, setCopied] = useState(false);

  const loadGame = useCallback(async (code) => {
    const { data } = await supabase
      .from("bingo_games")
      .select("code,title,names,called,hidden")
      .eq("code", code)
      .maybeSingle();
    return data;
  }, []);

  // 저장된 게임 복원
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!saved) {
      setLoading(false);
      return;
    }
    loadGame(saved).then((data) => {
      if (data) setGame(data);
      else localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
    });
  }, [loadGame]);

  const playUrl = useMemo(() => {
    if (!game || typeof window === "undefined") return "";
    return `${window.location.origin}/play/${game.code}`;
  }, [game]);

  // QR 생성
  useEffect(() => {
    if (!playUrl) return;
    QRCode.toDataURL(playUrl, { width: 520, margin: 2 }).then(setQrUrl);
  }, [playUrl]);

  // 참가자(이름 + 빙고판) 실시간 수신 (3초 폴링)
  useEffect(() => {
    if (!game) return undefined;
    const fetchPlayers = async () => {
      const { data } = await supabase
        .from("bingo_players")
        .select("id,nickname,names,created_at")
        .eq("game_code", game.code)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (data) setPlayers(data);
    };
    fetchPlayers();
    const t = setInterval(fetchPlayers, 3000);
    return () => clearInterval(t);
  }, [game]);

  // ── 테이블 1: 참가자 본인 이름 (중복 제거) ──────────────
  const participantPool = useMemo(() => {
    const seen = new Map();
    for (const p of players) {
      const key = normalizeName(p.nickname);
      if (key && !seen.has(key)) seen.set(key, p.nickname.trim());
    }
    return [...seen.values()];
  }, [players]);

  // ── 테이블 2: 빙고판에 적힌 모든 이름 (중복 제거 + 빈도) ──
  const hiddenKeys = useMemo(
    () => new Set((game?.hidden ?? []).map(normalizeName)),
    [game]
  );

  const boardPool = useMemo(() => {
    const map = new Map();
    for (const p of players) {
      const counted = new Set(); // 같은 사람 빙고판의 중복 이름은 1회만 센다
      for (const raw of p.names ?? []) {
        const key = normalizeName(raw);
        if (!key || counted.has(key)) continue;
        counted.add(key);
        const entry = map.get(key);
        if (entry) entry.count += 1;
        else map.set(key, { key, display: String(raw).trim(), count: 1 });
      }
    }
    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.display.localeCompare(b.display, "ko")
    );
  }, [players]);

  const visibleBoardPool = useMemo(
    () => boardPool.filter((e) => !hiddenKeys.has(e.key)),
    [boardPool, hiddenKeys]
  );

  const selectedKeys = useMemo(() => new Set(selected.map(normalizeName)), [selected]);

  const toggleSelect = (name) => {
    setError("");
    const key = normalizeName(name);
    setSelected((prev) => {
      if (prev.some((n) => normalizeName(n) === key)) {
        return prev.filter((n) => normalizeName(n) !== key);
      }
      if (prev.length >= 25) return prev;
      return [...prev, name];
    });
  };

  const autoSelectParticipants = () => {
    setError("");
    setSelected(participantPool.slice(0, 25));
  };

  const autoSelectBoard = () => {
    setError("");
    setSelected(visibleBoardPool.slice(0, 25).map((e) => e.display));
  };

  // 빙고판 이름 테이블에서 이름 삭제 (DB에 저장되어 유지)
  const hideBoardName = async (entry) => {
    if (!game) return;
    const prevHidden = game.hidden ?? [];
    const nextHidden = [...prevHidden, entry.display];
    setGame({ ...game, hidden: nextHidden });
    setSelected((prev) => prev.filter((n) => normalizeName(n) !== entry.key));
    const { error: err } = await supabase
      .from("bingo_games")
      .update({ hidden: nextHidden, updated_at: new Date().toISOString() })
      .eq("code", game.code);
    if (err) {
      setGame({ ...game, hidden: prevHidden });
      window.alert("이름을 지우지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.");
    }
  };

  const restoreHidden = async () => {
    if (!game) return;
    setGame({ ...game, hidden: [] });
    await supabase
      .from("bingo_games")
      .update({ hidden: [], updated_at: new Date().toISOString() })
      .eq("code", game.code);
  };

  const createGame = async () => {
    setError("");
    if (!title.trim()) {
      setError("게임 이름을 입력해 주세요.");
      return;
    }
    setCreating(true);
    const code = makeGameCode();
    const { data, error: err } = await supabase
      .from("bingo_games")
      .insert({ code, title: title.trim(), names: [], called: [], hidden: [], mode: "name" })
      .select("code,title,names,called,hidden")
      .single();
    setCreating(false);
    if (err || !data) {
      setError("게임을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    localStorage.setItem(STORAGE_KEY, data.code);
    setGame(data);
  };

  const confirmNames = async () => {
    if (!game || selected.length !== 25) return;
    const { error: err } = await supabase
      .from("bingo_games")
      .update({ names: selected, updated_at: new Date().toISOString() })
      .eq("code", game.code);
    if (err) {
      setError("이름을 저장하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setGame({ ...game, names: selected });
  };

  const backToSelect = async () => {
    if (!game) return;
    if (!window.confirm("이름을 다시 선택할까요? 호출 기록도 초기화됩니다.")) return;
    await supabase
      .from("bingo_games")
      .update({ names: [], called: [], updated_at: new Date().toISOString() })
      .eq("code", game.code);
    setSelected(game.names ?? []);
    setGame({ ...game, names: [], called: [] });
  };

  const toggleCalled = async (name) => {
    if (!game) return;
    const key = normalizeName(name);
    const called = game.called ?? [];
    const next = called.some((c) => normalizeName(c) === key)
      ? called.filter((c) => normalizeName(c) !== key)
      : [...called, name];
    setGame({ ...game, called: next }); // 낙관적 업데이트
    const { error: err } = await supabase
      .from("bingo_games")
      .update({ called: next, updated_at: new Date().toISOString() })
      .eq("code", game.code);
    if (err) {
      const fresh = await loadGame(game.code);
      if (fresh) setGame(fresh);
    }
  };

  const resetCalled = async () => {
    if (!game) return;
    if (!window.confirm("호출한 이름을 모두 초기화할까요?")) return;
    setGame({ ...game, called: [] });
    await supabase
      .from("bingo_games")
      .update({ called: [], updated_at: new Date().toISOString() })
      .eq("code", game.code);
  };

  const startNewGame = () => {
    if (!window.confirm("새 게임을 만들까요? 지금 게임 링크는 그대로 유지됩니다.")) return;
    localStorage.removeItem(STORAGE_KEY);
    setGame(null);
    setQrUrl("");
    setTitle("");
    setPlayers([]);
    setSelected([]);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(playUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 미지원 브라우저는 무시 */
    }
  };

  if (loading) {
    return (
      <main className="page">
        <p className="status-line">불러오는 중…</p>
      </main>
    );
  }

  // ── 게임 진행 화면 (25명 확정 후: 이름 호출) ────────────
  if (game && (game.names ?? []).length === 25) {
    const calledKeys = new Set((game.called ?? []).map(normalizeName));
    const orderOf = (name) =>
      (game.called ?? []).findIndex((c) => normalizeName(c) === normalizeName(name)) + 1;

    return (
      <main className="page page-wide">
        <h1 className="game-title">{game.title}</h1>
        <p className="subtitle">진행자 화면 · 참가자 {players.length}명 접속</p>

        <section className="card">
          <h2>
            📣 이름을 클릭해서 호출하세요 ({(game.called ?? []).length}/25) — 다시 클릭하면
            취소됩니다
          </h2>
          <div className="host-grid">
            {(game.names ?? []).map((name) => {
              const isCalled = calledKeys.has(normalizeName(name));
              return (
                <button
                  key={name}
                  className={`name-btn${isCalled ? " called" : ""}`}
                  onClick={() => toggleCalled(name)}
                >
                  {name}
                  {isCalled && <span className="order-badge">{orderOf(name)}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <div className="row">
          <button className="btn btn-danger" onClick={resetCalled}>
            호출 초기화
          </button>
          <button className="btn btn-secondary" onClick={backToSelect}>
            이름 다시 선택
          </button>
          <button className="btn btn-secondary" onClick={startNewGame}>
            새 게임 만들기
          </button>
        </div>
      </main>
    );
  }

  // ── 참가자 모집 + 25명 선택 화면 (테이블 2개) ───────────
  if (game) {
    const hiddenCount = (game.hidden ?? []).length;
    return (
      <main className="page page-wide">
        <h1 className="game-title">{game.title}</h1>
        <p className="subtitle">진행자 화면 · 이름을 탭해 게임에 쓸 25명을 선택하세요</p>

        <section className="card">
          <h2>📱 참가자 입장 QR</h2>
          <div className="qr-box">
            {qrUrl && <img src={qrUrl} alt="참가자 입장 QR 코드" />}
            <span className="code-pill">{game.code}</span>
            <div className="link-line">
              <input className="text-input" readOnly value={playUrl} onFocus={(e) => e.target.select()} />
              <button className="btn btn-secondary" onClick={copyLink}>
                {copied ? "복사됨!" : "복사"}
              </button>
            </div>
          </div>
        </section>

        <div className="select-bar">
          <span className="select-count">
            선택 <strong>{selected.length}</strong>/25
          </span>
          <button
            className="btn btn-danger btn-small"
            onClick={() => setSelected([])}
            disabled={selected.length === 0}
          >
            선택 초기화
          </button>
        </div>

        <section className="card">
          <h2>🙋 테이블 1 · 참가자 이름 ({participantPool.length}명 접속)</h2>
          <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
            빙고판을 제출한 참가자의 이름이 실시간으로 들어옵니다. 탭하면 선택됩니다.
          </p>
          {participantPool.length === 0 ? (
            <p className="empty-note">아직 참가자가 없습니다. QR을 보여 주세요!</p>
          ) : (
            <div className="host-grid">
              {participantPool.map((name) => {
                const isSelected = selectedKeys.has(normalizeName(name));
                return (
                  <button
                    key={name}
                    className={`name-btn${isSelected ? " selected" : ""}`}
                    onClick={() => toggleSelect(name)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn btn-secondary"
              onClick={autoSelectParticipants}
              disabled={participantPool.length === 0}
            >
              먼저 온 참가자 25명 자동 선택
            </button>
          </div>
        </section>

        <section className="card">
          <h2>📝 테이블 2 · 빙고판에 적힌 이름 ({visibleBoardPool.length}개)</h2>
          <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
            참가자들이 25칸에 적은 이름을 중복 없이 모았습니다. 숫자는 그 이름이 적힌
            빙고판 수, <strong>×</strong>를 누르면 목록에서 지워집니다. 탭하면 선택됩니다.
          </p>
          {visibleBoardPool.length === 0 ? (
            <p className="empty-note">아직 빙고판에 적힌 이름이 없습니다.</p>
          ) : (
            <div className="chips">
              {visibleBoardPool.map((entry) => {
                const isSelected = selectedKeys.has(entry.key);
                return (
                  <span key={entry.key} className={`pool-chip${isSelected ? " selected" : ""}`}>
                    <button
                      className="pool-chip-main"
                      onClick={() => toggleSelect(entry.display)}
                    >
                      {entry.display}
                      <span className="cnt">{entry.count}</span>
                    </button>
                    <button
                      className="pool-chip-del"
                      onClick={() => hideBoardName(entry)}
                      aria-label={`${entry.display} 삭제`}
                      title="목록에서 지우기"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn btn-secondary"
              onClick={autoSelectBoard}
              disabled={visibleBoardPool.length === 0}
            >
              많이 적힌 이름 25개 자동 선택
            </button>
            {hiddenCount > 0 && (
              <button className="btn btn-secondary" onClick={restoreHidden}>
                지운 이름 {hiddenCount}개 복원
              </button>
            )}
          </div>
          {error && <p className="error-text">{error}</p>}
        </section>

        <button
          className="btn btn-primary"
          onClick={confirmNames}
          disabled={selected.length !== 25}
        >
          {selected.length === 25
            ? "🎮 이 25명으로 게임 진행하기"
            : `25명을 선택해 주세요 (${selected.length}/25)`}
        </button>

        <div className="center" style={{ marginTop: 14 }}>
          <button className="btn btn-secondary" onClick={startNewGame}>
            새 게임 만들기
          </button>
        </div>
      </main>
    );
  }

  // ── 시작 화면: 게임 이름 + 시작 버튼만 ──────────────────
  return (
    <main className="page">
      <h1 className="game-title">이름 빙고</h1>
      <p className="subtitle">진행자용 · 게임 이름을 정하고 시작하세요</p>

      <section className="card">
        <h2>게임 이름</h2>
        <input
          className="text-input"
          placeholder="예) 2026 신입생 환영회 이름 빙고"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
        />
        {error && <p className="error-text">{error}</p>}
      </section>

      <button className="btn btn-primary" onClick={createGame} disabled={creating}>
        {creating ? "만드는 중…" : "🎮 게임 시작하기"}
      </button>

      <p className="hint center" style={{ marginTop: 14 }}>
        게임을 시작하면 QR 코드가 생성되고, 참가자들이 적은 이름이 실시간으로 들어옵니다.
      </p>
    </main>
  );
}
