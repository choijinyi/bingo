"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";
import { makeGameCode, normalizeName, parseBulkNames } from "../lib/bingo";

const STORAGE_KEY = "name-bingo-host-code";

export default function HostPage() {
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");

  // 게임 만들기 폼 상태
  const [title, setTitle] = useState("");
  const [names, setNames] = useState(Array(25).fill(""));
  const [bulk, setBulk] = useState("");
  const [creating, setCreating] = useState(false);

  // 진행 화면 상태
  const [qrUrl, setQrUrl] = useState("");
  const [playerCount, setPlayerCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  const loadGame = useCallback(async (code) => {
    const { data } = await supabase
      .from("bingo_games")
      .select("code,title,names,called")
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

  // 참가자 수 폴링
  useEffect(() => {
    if (!game) return undefined;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("bingo_players")
        .select("id", { count: "exact", head: true })
        .eq("game_code", game.code);
      if (typeof count === "number") setPlayerCount(count);
    };
    fetchCount();
    pollRef.current = setInterval(fetchCount, 5000);
    return () => clearInterval(pollRef.current);
  }, [game]);

  const applyBulk = (text) => {
    setBulk(text);
    const parsed = parseBulkNames(text);
    setNames((prev) => {
      const next = Array(25).fill("");
      for (let i = 0; i < 25; i += 1) next[i] = parsed[i] ?? "";
      return parsed.length > 0 ? next : prev;
    });
  };

  const setNameAt = (idx, value) => {
    setNames((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const filledCount = names.filter((n) => n.trim()).length;

  const createGame = async () => {
    setError("");
    const trimmed = names.map((n) => n.trim());
    if (!title.trim()) {
      setError("게임 이름을 입력해 주세요.");
      return;
    }
    if (trimmed.some((n) => !n)) {
      setError(`이름 25개를 모두 채워 주세요. (현재 ${filledCount}/25)`);
      return;
    }
    const dupes = trimmed.filter(
      (n, i) => trimmed.findIndex((m) => normalizeName(m) === normalizeName(n)) !== i
    );
    if (dupes.length > 0) {
      setError(`중복된 이름이 있습니다: ${[...new Set(dupes)].join(", ")}`);
      return;
    }
    setCreating(true);
    const code = makeGameCode();
    const { data, error: err } = await supabase
      .from("bingo_games")
      .insert({ code, title: title.trim(), names: trimmed, called: [], mode: "name" })
      .select("code,title,names,called")
      .single();
    setCreating(false);
    if (err || !data) {
      setError("게임을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    localStorage.setItem(STORAGE_KEY, data.code);
    setGame(data);
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
    setNames(Array(25).fill(""));
    setBulk("");
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

  // ── 진행 화면 ──────────────────────────────────────
  if (game) {
    const calledKeys = new Set((game.called ?? []).map(normalizeName));
    const orderOf = (name) =>
      (game.called ?? []).findIndex((c) => normalizeName(c) === normalizeName(name)) + 1;

    return (
      <main className="page">
        <h1 className="game-title">{game.title}</h1>
        <p className="subtitle">진행자 화면 · 참가자 {playerCount}명 접속</p>

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
          <button className="btn btn-secondary" onClick={startNewGame}>
            새 게임 만들기
          </button>
        </div>
      </main>
    );
  }

  // ── 게임 만들기 화면 ────────────────────────────────
  return (
    <main className="page">
      <h1 className="game-title">이름 빙고</h1>
      <p className="subtitle">진행자용 · 게임을 만들고 QR로 참가자를 초대하세요</p>

      <section className="card">
        <h2>1. 게임 이름</h2>
        <input
          className="text-input"
          placeholder="예) 2026 신입생 환영회 이름 빙고"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
        />
      </section>

      <section className="card">
        <h2>2. 이름 25개 한 번에 붙여넣기</h2>
        <textarea
          className="bulk-textarea"
          placeholder={"김철수\n이영희\n박민수\n… (줄바꿈 또는 쉼표로 구분해 25명)"}
          value={bulk}
          onChange={(e) => applyBulk(e.target.value)}
        />
        <p className="hint">
          엑셀·메모장에서 복사한 명단을 그대로 붙여넣으면 아래 25칸이 자동으로 채워집니다.
        </p>
      </section>

      <section className="card">
        <h2>3. 이름 확인 및 수정 ({filledCount}/25)</h2>
        <div className="grid-25">
          {names.map((name, i) => (
            <input
              key={i}
              className={`cell-input${name.trim() ? " filled" : ""}`}
              value={name}
              placeholder={String(i + 1)}
              onChange={(e) => setNameAt(i, e.target.value)}
            />
          ))}
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>

      <button className="btn btn-primary" onClick={createGame} disabled={creating}>
        {creating ? "만드는 중…" : "🎮 게임 시작하기"}
      </button>
    </main>
  );
}
