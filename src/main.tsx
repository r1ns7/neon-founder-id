import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  Download,
  Loader2,
  QrCode,
  RefreshCcw,
  ScanFace,
  Sparkles,
  Upload,
} from "lucide-react";
import QRCode from "qrcode";
import "./style.css";

type Audience = "students" | "pros";
type Step = "welcome" | "quiz" | "consent" | "photo" | "processing" | "result";
type AnswerId = "a" | "b" | "c" | "d";

type Question = {
  id: number;
  block: 1 | 2;
  text: string;
  answers: Record<AnswerId, { text: string; score: number }>;
};

type Profile = {
  id: string;
  title: string;
  subtitle: string;
  fields: string;
  template: string;
};

type TemplateConfig = {
  file: string;
  head: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

const scores: Record<AnswerId, number> = { a: 1, b: 2, c: 3, d: 0 };

const sharedAnswers = (items: Record<AnswerId, string>) =>
  Object.fromEntries(
    (Object.keys(items) as AnswerId[]).map((id) => [id, { text: items[id], score: scores[id] }]),
  ) as Question["answers"];

const questionSets: Record<Audience, Question[]> = {
  pros: [
    {
      id: 1,
      block: 1,
      text: "Вам предложили бизнес-идею в совершенно незнакомой сфере. Ваш первый шаг?",
      answers: sharedAnswers({
        a: "Изучу аналитику рынка, отчеты и конкурентов.",
        b: "Позвоню знакомым из смежных областей и спрошу их мнение.",
        c: "Сделаю дешевый прототип и попробую продать.",
        d: "Откажусь: учиться на ходу слишком рискованно.",
      }),
    },
    {
      id: 2,
      block: 1,
      text: "Как вы реагируете на сильного конкурента с низкими ценами?",
      answers: sharedAnswers({
        a: "Снижаю цены и запускаю рекламную кампанию.",
        b: "Ищу слабые места конкурента и усиливаю свои преимущества.",
        c: "Меняю модель: закрытый клуб или премиум-подписка.",
        d: "Жду: у конкурента скоро закончатся деньги.",
      }),
    },
    {
      id: 3,
      block: 1,
      text: "Вы выбираете сферу для бизнеса. Что на первом месте?",
      answers: sharedAnswers({
        a: "Маржинальность и прибыльность.",
        b: "Мое личное экспертное знание.",
        c: "Социальная значимость и польза для людей.",
        d: "Масштабируемость без моего постоянного участия.",
      }),
    },
    {
      id: 4,
      block: 2,
      text: "Ваше утро обычно начинается с того, что вы:",
      answers: sharedAnswers({
        a: "Просматриваете новости, тренды и отраслевые дайджесты.",
        b: "Проверяете отчеты, план продаж и письма клиентов.",
        c: "Планируете день в тишине, чтобы войти в поток.",
        d: "Звоните партнерам или команде, чтобы ускорить процессы.",
      }),
    },
    {
      id: 5,
      block: 2,
      text: "Какая формула бизнеса вам ближе интуитивно?",
      answers: sharedAnswers({
        a: "Лучше синица в руках, чем журавль в небе.",
        b: "Кто не рискует, тот не пьет шампанское.",
        c: "Семь раз отмерь, один раз отрежь.",
        d: "Бери больше, кидай дальше.",
      }),
    },
  ],
  students: [
    {
      id: 1,
      block: 1,
      text: "Поступило предложение о подработке в незнакомой профессиональной сфере. Ваш первый шаг?",
      answers: sharedAnswers({
        a: "Изучу аналитические материалы и профильные публикации.",
        b: "Обращусь за консультацией к знакомым из смежных областей.",
        c: "Сделаю минимальный образец продукта и соберу обратную связь.",
        d: "Отклоню предложение из-за риска ошибок.",
      }),
    },
    {
      id: 2,
      block: 1,
      text: "Проект оказался невостребованным на этапе тестирования. Ваши действия?",
      answers: sharedAnswers({
        a: "Завершу работу согласно первоначальному плану.",
        b: "Прекращу проект и начну искать новую идею.",
        c: "Передам продукт 5-10 пользователям, соберу отзывы и доработаю.",
        d: "Изменю упаковку и перенаправлю маркетинг на другую аудиторию.",
      }),
    },
    {
      id: 3,
      block: 1,
      text: "В вашем распоряжении 50 000 рублей для развития дела. Какое решение вы примете?",
      answers: sharedAnswers({
        a: "Направлю средства на рекламу и профессиональную фотосъемку.",
        b: "Инвестирую в обучение или консультацию эксперта.",
        c: "Вложу в автоматизацию системы учета заказов.",
        d: "Отложу средства в резервный фонд.",
      }),
    },
    {
      id: 4,
      block: 2,
      text: "Как обычно начинается ваш день?",
      answers: sharedAnswers({
        a: "Просмотр новостей и трендов.",
        b: "Проверка заказов и задач.",
        c: "Планирование в тишине.",
        d: "Звонки для ускорения процессов.",
      }),
    },
    {
      id: 5,
      block: 2,
      text: "Какая поговорка вам ближе по духу?",
      answers: sharedAnswers({
        a: "Синица в руках.",
        b: "Риск - благородное дело.",
        c: "Семь раз отмерь.",
        d: "Бери больше - кидай дальше.",
      }),
    },
  ],
};

const profiles: Record<string, Profile> = {
  architect: {
    id: "architect",
    title: "Стратег-Архитектор",
    subtitle: "Системность, дисциплина и длинное планирование.",
    fields: "Проекты, финансы, логистика, франшиза, B2B-сервисы.",
    template: "architect",
  },
  innovator: {
    id: "innovator",
    title: "Инноватор-Коммуникатор",
    subtitle: "Гибкость, контактность и быстрая адаптация.",
    fields: "Маркетинг, PR, SMM, HR, EdTech, мероприятия.",
    template: "innovator",
  },
  owner: {
    id: "owner",
    title: "Практик-Собственник",
    subtitle: "Энергия старта, прагматизм и быстрый результат.",
    fields: "Розница, кафе, сервисы, доставка, ремонт, малое производство.",
    template: "owner",
  },
  hybrid: {
    id: "hybrid",
    title: "Гибридный профиль",
    subtitle: "Стратегическое видение и сильная работа с людьми.",
    fields: "Технологические платформы, холдинги, венчурные проекты.",
    template: "hybrid",
  },
};

const templateConfigs: Record<string, TemplateConfig> = {
  architect: {
    file: "architect.png",
    head: { x: 1790, y: 1250, width: 980, height: 1450 },
  },
  innovator: {
    file: "innovator.png",
    head: { x: 1710, y: 1030, width: 1070, height: 1510 },
  },
  owner: {
    file: "owner.png",
    head: { x: 1795, y: 1240, width: 960, height: 1420 },
  },
  hybrid: {
    file: "hybrid.jpg",
    head: { x: 1790, y: 1240, width: 1000, height: 1470 },
  },
};

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = sourceHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = sourceWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) * 0.22;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

async function composeStudentTemplate(photoData: string, profile: Profile) {
  const config = templateConfigs[profile.template] ?? templateConfigs.hybrid;
  const templateUrl = `${import.meta.env.BASE_URL}templates/${config.file}`;
  const [templateImage, photoImage] = await Promise.all([loadImage(templateUrl), loadImage(photoData)]);
  const canvas = document.createElement("canvas");
  canvas.width = templateImage.naturalWidth;
  canvas.height = templateImage.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.drawImage(templateImage, 0, 0);

  const { x, y, width, height } = config.head;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const mask = maskCanvas.getContext("2d");
  if (!mask) throw new Error("Canvas mask is unavailable");

  mask.save();
  mask.filter = "blur(16px)";
  mask.beginPath();
  mask.ellipse(x + width / 2, y + height / 2, width * 0.49, height * 0.5, 0, 0, Math.PI * 2);
  mask.fillStyle = "black";
  mask.fill();
  mask.restore();
  mask.globalCompositeOperation = "source-in";
  mask.filter = "saturate(1.05) contrast(1.04) brightness(0.96)";
  drawCoverImage(mask, photoImage, x - width * 0.03, y - height * 0.08, width * 1.06, height * 1.16);

  context.save();
  context.globalCompositeOperation = "source-over";
  context.drawImage(maskCanvas, 0, 0);
  context.restore();

  const tint = context.createRadialGradient(
    x + width * 0.2,
    y + height * 0.12,
    width * 0.1,
    x + width * 0.5,
    y + height * 0.5,
    height * 0.62,
  );
  tint.addColorStop(0, "rgba(255, 224, 196, 0.22)");
  tint.addColorStop(0.52, "rgba(107, 31, 160, 0.08)");
  tint.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.globalCompositeOperation = "soft-light";
  context.fillStyle = tint;
  context.fillRect(x - 80, y - 120, width + 160, height + 180);
  context.globalCompositeOperation = "source-over";

  return canvas.toDataURL("image/jpeg", 0.92);
}

function getProfile(audience: Audience, answers: Record<number, AnswerId>) {
  const questions = questionSets[audience];
  const block1 = questions
    .filter((question) => question.block === 1)
    .reduce((sum, question) => sum + question.answers[answers[question.id]]?.score || sum, 0);
  const block2 = questions
    .filter((question) => question.block === 2)
    .reduce((sum, question) => sum + question.answers[answers[question.id]]?.score || sum, 0);

  if (block1 >= 8 && block2 >= 5) return { profile: profiles.architect, block1, block2 };
  if (block1 >= 6 && block1 <= 7 && block2 >= 3 && block2 <= 4) {
    return { profile: profiles.innovator, block1, block2 };
  }
  if (block1 <= (audience === "pros" ? 4 : 5) && block2 <= 2) {
    return { profile: profiles.owner, block1, block2 };
  }
  return { profile: profiles.hybrid, block1, block2 };
}

function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [audience, setAudience] = useState<Audience>("students");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerId>>({});
  const [photo, setPhoto] = useState<string>("");
  const [resultUrl, setResultUrl] = useState("");
  const [qr, setQr] = useState("");
  const [status, setStatus] = useState("");
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const questions = questionSets[audience];
  const current = questions[questionIndex];
  const complete = Object.keys(answers).length === questions.length;
  const outcome = useMemo(() => getProfile(audience, answers), [answers, audience]);

  useEffect(() => {
    if (step !== "photo") return;

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: 1280, height: 720 }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError("");
      })
      .catch(() => setCameraError("Камера не найдена. Можно загрузить фото файлом."));

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [step]);

  useEffect(() => {
    if (!resultUrl) return;
    if (!resultUrl.startsWith("/")) {
      setQr("");
      return;
    }
    QRCode.toDataURL(window.location.origin + resultUrl, { margin: 1, width: 260 }).then(setQr);
  }, [resultUrl]);

  function restart() {
    setStep("welcome");
    setQuestionIndex(0);
    setAnswers({});
    setPhoto("");
    setResultUrl("");
    setQr("");
    setStatus("");
  }

  function selectAnswer(id: AnswerId) {
    setAnswers((prev) => ({ ...prev, [current.id]: id }));
    window.setTimeout(() => {
      if (questionIndex < questions.length - 1) setQuestionIndex((index) => index + 1);
      else setStep("consent");
    }, 180);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context?.translate(canvas.width, 0);
    context?.scale(-1, 1);
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", 0.92));
  }

  async function processPhoto(photoData = photo) {
    if (!photoData) return;
    setStep("processing");
    setStatus("Вставляем фото в студенческий шаблон...");

    if (window.location.hostname.endsWith("github.io")) {
      try {
        const composed = await composeStudentTemplate(photoData, outcome.profile);
        setResultUrl(composed);
        setStep("result");
      } catch {
        setStatus("Не удалось собрать шаблон в браузере. Попробуйте другой кадр.");
      }
      return;
    }

    const response = await fetch(photoData);
    const blob = await response.blob();
    const formData = new FormData();
    formData.append("photo", blob, "visitor.jpg");
    formData.append("profile", outcome.profile.id);
    formData.append("template", outcome.profile.template);
    formData.append("block1", String(outcome.block1));
    formData.append("block2", String(outcome.block2));

    try {
      const result = await fetch("/api/process-photo", { method: "POST", body: formData });
      if (!result.ok) throw new Error(await result.text());
      const payload = (await result.json()) as { resultUrl: string };
      setResultUrl(payload.resultUrl);
      setStep("result");
    } catch {
      try {
        const composed = await composeStudentTemplate(photoData, outcome.profile);
        setResultUrl(composed);
        setStep("result");
      } catch {
        setStatus("Не удалось обработать фото. Проверьте сервер или попробуйте другой кадр.");
      }
    }
  }

  function uploadPhoto(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      setPhoto(data);
      processPhoto(data);
    };
    reader.readAsDataURL(file);
  }

  return (
    <main className="kiosk-shell">
      <div className="scanline" />
      <header className="topbar">
        <div className="brand">
          <ScanFace />
          <span>Neon Founder ID</span>
        </div>
        <div className="status-pill">
          <Sparkles size={18} />
          AI photo kiosk
        </div>
      </header>

      {step === "welcome" && (
        <section className="screen welcome">
          <div className="hero-copy">
            <p className="eyebrow">Профиль предпринимателя за 5 вопросов</p>
            <h1>Пройди тест и получи свой AI-образ</h1>
            <p>
              Киоск определит тип предпринимателя, выберет визуальный шаблон и подготовит фото с
              вашим лицом.
            </p>
          </div>

          <div className="audience-panel">
            <button
              className={audience === "students" ? "choice active" : "choice"}
              onClick={() => setAudience("students")}
            >
              Студенты колледжа
            </button>
            <button
              className={audience === "pros" ? "choice active" : "choice"}
              onClick={() => setAudience("pros")}
            >
              Профессионалы
            </button>
            <button className="primary big" onClick={() => setStep("quiz")}>
              <Sparkles />
              Начать
            </button>
          </div>
        </section>
      )}

      {step === "quiz" && (
        <section className="screen quiz">
          <div className="progress">
            <span>
              Вопрос {questionIndex + 1} из {questions.length}
            </span>
            <div>
              <i style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
            </div>
          </div>

          <article className="question-card">
            <p className="eyebrow">{current.block === 1 ? "Бизнес-решения" : "Личные качества"}</p>
            <h2>{current.text}</h2>
            <div className="answers">
              {(Object.keys(current.answers) as AnswerId[]).map((id) => (
                <button
                  key={id}
                  className={answers[current.id] === id ? "answer selected" : "answer"}
                  onClick={() => selectAnswer(id)}
                >
                  <b>{id.toUpperCase()}</b>
                  <span>{current.answers[id].text}</span>
                  {answers[current.id] === id && <Check />}
                </button>
              ))}
            </div>
          </article>

          <footer className="nav-row">
            <button
              className="ghost"
              disabled={questionIndex === 0}
              onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))}
            >
              <ArrowLeft />
              Назад
            </button>
            {complete && (
              <button className="primary" onClick={() => setStep("consent")}>
                К результату
              </button>
            )}
          </footer>
        </section>
      )}

      {step === "consent" && (
        <section className="screen consent">
          <div className="result-preview">
            <BadgeCheck />
            <p className="eyebrow">Ваш профиль</p>
            <h2>{outcome.profile.title}</h2>
            <p>{outcome.profile.subtitle}</p>
            <span>{outcome.profile.fields}</span>
            <div className="score-grid">
              <div>
                <b>{outcome.block1}</b>
                <small>Блок 1</small>
              </div>
              <div>
                <b>{outcome.block2}</b>
                <small>Блок 2</small>
              </div>
            </div>
          </div>
          <div className="consent-box">
            <h2>Сделаем фото для AI-образа?</h2>
            <p>
              Фото используется для создания результата на этом киоске. Исходный снимок можно
              удалять после сессии, а готовые изображения хранить ограниченное время.
            </p>
            <button className="primary big" onClick={() => setStep("photo")}>
              <Camera />
              Перейти к съемке
            </button>
          </div>
        </section>
      )}

      {step === "photo" && (
        <section className="screen photo">
          <div className="camera-frame">
            {cameraError ? (
              <div className="camera-placeholder">{cameraError}</div>
            ) : (
              <video ref={videoRef} autoPlay muted playsInline />
            )}
          </div>
          <aside className="photo-actions">
            <h2>Фото для обработки</h2>
            <p>Встаньте по центру кадра, смотрите в камеру, лицо должно быть хорошо освещено.</p>
            {photo && <img className="snapshot" src={photo} alt="Снимок пользователя" />}
            <button className="primary" onClick={photo ? () => processPhoto() : capturePhoto}>
              <Camera />
              {photo ? "Обработать фото" : "Сфотографировать"}
            </button>
            <label className="ghost upload">
              <Upload />
              Загрузить фото
              <input type="file" accept="image/*" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
            </label>
          </aside>
        </section>
      )}

      {step === "processing" && (
        <section className="screen processing">
          <Loader2 className="spin" />
          <h2>{status}</h2>
          <p>Демо-движок уже работает локально. Face-swap модель можно подключить следующим слоем.</p>
        </section>
      )}

      {step === "result" && (
        <section className="screen result">
          <div className="poster">
            <img src={resultUrl} alt="Готовый AI-постер" />
          </div>
          <aside className="result-side">
            <p className="eyebrow">Готово</p>
            <h2>{outcome.profile.title}</h2>
            <p>{outcome.profile.subtitle}</p>
            {qr ? (
              <div className="qr">
                <img src={qr} alt="QR-код для скачивания" />
                <span>
                  <QrCode size={18} />
                  Сканируйте, чтобы забрать фото
                </span>
              </div>
            ) : (
              <div className="qr text-only">
                <span>
                  <QrCode size={18} />
                  Результат собран в браузере. Используйте кнопку скачивания.
                </span>
              </div>
            )}
            <a className="primary" href={resultUrl} download>
              <Download />
              Скачать
            </a>
            <button className="ghost" onClick={restart}>
              <RefreshCcw />
              Новый участник
            </button>
          </aside>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
