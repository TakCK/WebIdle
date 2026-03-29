import "./styles.css";
import { GameApp } from "./ui/app";
import { ProgressApiService } from "./services/progressApi";

const root = document.getElementById("app");
if (!root) throw new Error("app root not found");

const progressApi = new ProgressApiService();

type AuthView = "login" | "register";

function startGame(): void {
  root.innerHTML = "";
  new GameApp(root).mount();
}

function renderAuth(view: AuthView, flashMessage = "", flashOk = false): void {
  const isLogin = view === "login";

  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <h1>${isLogin ? "Idle Game 로그인" : "Idle Game 회원가입"}</h1>
        <p class="auth-sub">${isLogin ? "계정 로그인 후 게임을 시작할 수 있습니다." : "새 계정을 생성한 뒤 로그인하세요."}</p>

        <label class="auth-label" for="auth-username">아이디</label>
        <input id="auth-username" class="auth-input" type="text" placeholder="아이디 (영문/숫자/_/-)" maxlength="24" />

        <label class="auth-label" for="auth-password">비밀번호</label>
        <input id="auth-password" class="auth-input" type="password" placeholder="비밀번호" maxlength="128" />

        ${isLogin ? "" : `
          <label class="auth-label" for="auth-password-confirm">비밀번호 확인</label>
          <input id="auth-password-confirm" class="auth-input" type="password" placeholder="비밀번호 확인" maxlength="128" />
        `}

        <p id="auth-message" class="auth-message ${flashMessage ? (flashOk ? "ok" : "error") : ""}" aria-live="polite">${flashMessage}</p>

        <div class="auth-actions auth-actions-single">
          <button id="auth-primary-btn" type="button">${isLogin ? "로그인" : "회원가입"}</button>
        </div>

        <div class="auth-switch-row">
          <span>${isLogin ? "계정이 없나요?" : "이미 계정이 있나요?"}</span>
          <button id="auth-switch-btn" type="button" class="auth-switch-btn">${isLogin ? "회원가입 페이지로" : "로그인 페이지로"}</button>
        </div>
      </div>
    </div>
  `;

  const usernameInput = root.querySelector<HTMLInputElement>("#auth-username");
  const passwordInput = root.querySelector<HTMLInputElement>("#auth-password");
  const confirmInput = root.querySelector<HTMLInputElement>("#auth-password-confirm");
  const message = root.querySelector<HTMLElement>("#auth-message");
  const primaryBtn = root.querySelector<HTMLButtonElement>("#auth-primary-btn");
  const switchBtn = root.querySelector<HTMLButtonElement>("#auth-switch-btn");

  if (!usernameInput || !passwordInput || !message || !primaryBtn || !switchBtn) {
    throw new Error("auth ui init failed");
  }

  const setBusy = (busy: boolean): void => {
    primaryBtn.disabled = busy;
    switchBtn.disabled = busy;
    usernameInput.disabled = busy;
    passwordInput.disabled = busy;
    if (confirmInput) confirmInput.disabled = busy;
  };

  const setMessage = (text: string, ok = false): void => {
    message.textContent = text;
    message.classList.toggle("ok", ok);
    message.classList.toggle("error", !ok && text.length > 0);
  };

  const submitLogin = async (): Promise<void> => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      setMessage("아이디와 비밀번호를 입력하세요.");
      return;
    }

    setBusy(true);
    setMessage("로그인 중...");

    const result = await progressApi.login(username, password);
    if (result.ok) {
      startGame();
      return;
    }

    setBusy(false);
    setMessage(result.message ?? "로그인 실패");
  };

  const submitRegister = async (): Promise<void> => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const passwordConfirm = confirmInput?.value ?? "";

    if (!username || !password || !passwordConfirm) {
      setMessage("아이디/비밀번호/비밀번호 확인을 입력하세요.");
      return;
    }

    if (password !== passwordConfirm) {
      setMessage("비밀번호가 일치하지 않습니다.");
      return;
    }

    setBusy(true);
    setMessage("회원가입 중...");

    const result = await progressApi.register(username, password);
    if (result.ok) {
      // 회원가입 후 자동 진입하지 않고 로그인 페이지로 이동
      renderAuth("login", "회원가입 완료. 로그인해주세요.", true);
      const userInput = root.querySelector<HTMLInputElement>("#auth-username");
      if (userInput) userInput.value = username;
      return;
    }

    setBusy(false);
    setMessage(result.message ?? "회원가입 실패");
  };

  primaryBtn.addEventListener("click", () => {
    void (isLogin ? submitLogin() : submitRegister());
  });

  switchBtn.addEventListener("click", () => {
    renderAuth(isLogin ? "register" : "login");
  });

  passwordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void (isLogin ? submitLogin() : submitRegister());
    }
  });

  if (confirmInput) {
    confirmInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submitRegister();
      }
    });
  }
}

// 로그인된 계정만 게임 진입 가능
if (progressApi.isAuthenticated()) {
  startGame();
} else {
  renderAuth("login");
}
