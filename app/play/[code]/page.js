"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { getBingoState, normalizeName } from "../../../lib/bingo";

const POLL_MS = 2000;
const storageKey = (code) => `name-bingo-player-${code}`;

export default function PlayPage() {
  const params = useParams();
  const code = String(params.code ?? "").toUpperCase();

  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  // 참가 폼 상태
  const [nickname, setNickname] = useState("");
  const [board, setBoard] = useState(Array(25).fill(""));
  const [joining, setJoining] = useState(false);

  // 참가 완료 여부 (localStorage에 저장된 내 빙고판)
  const [joined, setJoined] = useState(null);

  // 최초 로드: 게임 정보 + 저장된 참가 정보
  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data } = await supabase
        .from("bingo_games")
        .select("code,title,names,called")
        .eq("code", code)
        .maybeSingle();
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setGame(data);
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey(code)) ?? "null");
        if (saved?.nickname && Array.isArray(saved?.board) && saved.board.length === 25) {
          setJoined(saved);
        }
      } catch {
        /* 저장 데이터가 깨졌으면 새로 참가 */
      }
      setLoading(false);
    })();
  }, [code]);

  // 게임 시작 후 호출된 이름 폴링
  useEffect(() => {
    if (!joined || !code) return undefined;
    const poll = async () => {
      const { data } = await supabase
        .from("bingo_games")
        .select("title,called")
        .eq("code", code)
        .maybeSingle();
      if (data) setGame((prev) => (prev ? { ...prev, ...data } : prev));
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [joined, code]);

  const filledCount = board.filter((n) => n.trim()).length;
  const usedKeys = useMemo(() => new Set(board.map(normalizeName).filter(Boolean)), [board]);

  const setCellAt = (idx, value) => {
    setBoard((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  // 칩을 탭하면 첫 번째 빈 칸에 채운다
  const fillFromChip = (name) => {
    if (usedKeys.has(normalizeName(name))) return;
    setBoard((prev) => {
      const idx = prev.findIndex((n) => !n.trim());
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = name;
      return next;
    });
  };

  const fillRandom = () => {
    if (!game) return;
    const shuffled = [...(game.names ?? [])];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setBoard(shuffled.slice(0, 25));
  };

  const clearBoard = () => setBoard(Array(25).fill(""));

  const join = async () => {
    setError("");
    if (!nickname.trim()) {
      setError("내 이름을 입력해 주세요.");
      return;
    }
    const trimmed = board.map((n) => n.trim());
    if (trimmed.some((n) => !n)) {
      setError(`25칸을 모두 채워 주세요. (현재 ${filledCount}/25)`);
      return;
    }
    setJoining(true);
    const { data, error: err } = await supabase
      .from("bingo_players")
      .insert({ game_code: code, nickname: nickname.trim(), names: trimmed })
      .select("id")
      .single();
    setJoining(false);
    if (err || !data) {
      setError("참가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const saved = { id: data.id, nickname: nickname.trim(), board: trimmed };
    localStorage.setItem(storageKey(code), JSON.stringify(saved));
    setJoined(saved);
  };

  const leave = () => {
    if (!window.confirm("빙고판을 새로 만들까요? 지금 판은 사라집니다.")) return;
    localStorage.removeItem(storageKey(code));
    setJoined(null);
    setBoard(Array(25).fill(""));
  };

  if (loading) {
    return (
      <main className="page">
        <p className="status-line">불러오는 중…</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="page center">
        <h1 className="game-title">이름 빙고</h1>
        <div className="card">
          <p>
            게임을 찾을 수 없습니다. <br />
            초대 코드(<strong>{code}</strong>)를 다시 확인해 주세요.
          </p>
        </div>
      </main>
    );
  }

  // ── 게임 화면 (참가 완료) ──────────────────────────
  if (joined) {
    const calledSet = new Set((game.called ?? []).map(normalizeName));
    const { hit, bingoCount, lineCells } = getBingoState(joined.board, calledSet);

    return (
      <main className="page">
        <h1 className="game-title">{game.title}</h1>
        <p className="subtitle">
          {joined.nickname}님의 빙고판 · 호출 {(game.called ?? []).length}개
        </p>

        {bingoCount > 0 && (
          <div className="bingo-banner" key={bingoCount}>
            🎉 {bingoCount}줄 빙고! 🎉
          </div>
        )}

        <div className="board">
          {joined.board.map((name, i) => (
            <div
              key={i}
              className={`board-cell${hit[i] ? " called" : ""}${lineCells.has(i) ? " line" : ""}`}
            >
              {name}
            </div>
          ))}
        </div>

        <p className="hint center" style={{ marginTop: 14 }}>
          진행자가 이름을 부르면 자동으로 빨간색으로 표시됩니다.
        </p>
        <div className="center" style={{ marginTop: 18 }}>
          <button className="btn btn-secondary" onClick={leave}>
            빙고판 새로 만들기
          </button>
        </div>
      </main>
    );
  }

  // ── 참가 화면 (이름 + 25칸 작성) ────────────────────
  return (
    <main className="page">
      <h1 className="game-title">{game.title}</h1>
      <p className="subtitle">참가자용 · 내 이름과 빙고판 25칸을 채워 주세요</p>

      <section className="card">
        <h2>1. 내 이름</h2>
        <input
          className="text-input"
          placeholder="예) 홍길동"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
        />
      </section>

      <section className="card">
        <h2>2. 빙고판 채우기 ({filledCount}/25)</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn btn-secondary" onClick={fillRandom}>
            🎲 랜덤으로 채우기
          </button>
          <button className="btn btn-danger" onClick={clearBoard}>
            모두 지우기
          </button>
        </div>
        <div className="grid-25">
          {board.map((name, i) => (
            <input
              key={i}
              className={`cell-input${name.trim() ? " filled" : ""}`}
              value={name}
              placeholder={String(i + 1)}
              onChange={(e) => setCellAt(i, e.target.value)}
            />
          ))}
        </div>
        <p className="hint">
          칸을 눌러 직접 입력하거나, 아래 이름을 탭하면 빈 칸에 순서대로 들어갑니다.
        </p>
      </section>

      {(game.names ?? []).length > 0 && (
        <section className="card">
          <h2>참가자 이름 목록 (탭해서 채우기)</h2>
          <div className="chips">
            {game.names.map((name) => {
              const used = usedKeys.has(normalizeName(name));
              return (
                <button
                  key={name}
                  className={`chip${used ? " used" : ""}`}
                  onClick={() => fillFromChip(name)}
                  disabled={used}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {error && <p className="error-text">{error}</p>}

      <button className="btn btn-primary" onClick={join} disabled={joining} style={{ marginTop: 8 }}>
        {joining ? "참가하는 중…" : "✅ 빙고 시작!"}
      </button>
    </main>
  );
}
