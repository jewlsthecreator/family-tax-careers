import React, { useEffect, useMemo, useRef, useState } from "react";
import { post, postForm } from "./api.js";

const STEPS = [
  { n: 1, name: "Application", stages: ["application_received", "under_review"], note: "We review every application we receive." },
  { n: 2, name: "Information packet", stages: ["packet_sent", "packet_acknowledged"], note: "Read what the season looks like before you commit." },
  { n: 3, name: "Online assessment", stages: ["assessment_pending", "assessment_submitted", "assessment_passed"], note: "A short assessment you take right here." },
  { n: 4, name: "In-office skills session", stages: ["skills_invited", "skills_passed"], note: "Hands-on work at the office so we can see you in action." },
  { n: 5, name: "Interview", stages: ["final_interview"], note: "A short conversation with our lead strategist." },
  { n: 6, name: "Offer and training", stages: ["training_offer", "january_training", "final_roster"], note: "Paid training in January, then the season begins." },
];

function stepIndexFor(stage) {
  for (let i = 0; i < STEPS.length; i++) {
    if (STEPS[i].stages.includes(stage)) return i;
  }
  return 0;
}

function fmtPay(p) {
  if (!p.pay_min && !p.pay_max) return null;
  const unit = p.pay_unit === "hour" ? "/hr" : " " + (p.pay_unit || "");
  if (p.pay_min && p.pay_max) return "$" + Number(p.pay_min) + "-" + Number(p.pay_max) + unit;
  return "$" + Number(p.pay_min || p.pay_max) + unit;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mdToHtml(md) {
  const lines = esc(md || "").split(/\r?\n/);
  const out = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bolded = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (/^###\s+/.test(line)) { if (inList) { out.push("</ul>"); inList = false; } out.push("<h3>" + bolded.replace(/^###\s+/, "") + "</h3>"); continue; }
    if (/^##\s+/.test(line)) { if (inList) { out.push("</ul>"); inList = false; } out.push("<h2>" + bolded.replace(/^##\s+/, "") + "</h2>"); continue; }
    if (/^#\s+/.test(line)) { if (inList) { out.push("</ul>"); inList = false; } out.push("<h2>" + bolded.replace(/^#\s+/, "") + "</h2>"); continue; }
    if (/^[-*]\s+/.test(line)) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + bolded.replace(/^[-*]\s+/, "") + "</li>"); continue; }
    if (inList) { out.push("</ul>"); inList = false; }
    if (line === "") { out.push(""); continue; }
    out.push("<p>" + bolded + "</p>");
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function Header() {
  return (
    <div className="header">
      <div className="header-inner">
        <a className="brand" href="/">
          <img className="logo" src="/logo.png" alt="Family Tax" onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "inline"; }} />
          <span className="wordmark" style={{ display: "none" }}>Family Tax</span>
        </a>
        <span className="eyebrow">Careers</span>
      </div>
    </div>
  );
}

function Footer() {
  return <div className="footer">Family Tax Inc. &middot; Family owned since 2009 &middot; 25802 Hemingway Ave STE 103, Stevenson Ranch, CA 91381</div>;
}

function QuestionField({ q, value, onChange }) {
  const req = q.is_required ? <span className="req"> *</span> : null;
  if (q.input_type === "yes_no") {
    return (
      <div className="field">
        <label className="q">{q.prompt}{req}</label>
        {q.help_text ? <div className="help">{q.help_text}</div> : null}
        {["Yes", "No"].map((opt) => (
          <label key={opt} className={"choice" + (value === opt ? " on" : "")}>
            <input type="radio" name={q.id} checked={value === opt} onChange={() => onChange(opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.input_type === "select") {
    const opts = Array.isArray(q.options) ? q.options : [];
    return (
      <div className="field">
        <label className="q">{q.prompt}{req}</label>
        {q.help_text ? <div className="help">{q.help_text}</div> : null}
        {opts.map((opt) => (
          <label key={String(opt)} className={"choice" + (value === opt ? " on" : "")}>
            <input type="radio" name={q.id} checked={value === opt} onChange={() => onChange(opt)} />
            <span>{String(opt)}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.input_type === "multi_select") {
    const opts = Array.isArray(q.options) ? q.options : [];
    const arr = Array.isArray(value) ? value : [];
    const toggle = (opt) => {
      if (arr.includes(opt)) onChange(arr.filter((v) => v !== opt));
      else onChange([...arr, opt]);
    };
    return (
      <div className="field">
        <label className="q">{q.prompt}{req}</label>
        {q.help_text ? <div className="help">{q.help_text}</div> : null}
        {opts.map((opt) => (
          <label key={String(opt)} className={"choice" + (arr.includes(opt) ? " on" : "")}>
            <input type="checkbox" checked={arr.includes(opt)} onChange={() => toggle(opt)} />
            <span>{String(opt)}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.input_type === "long_text") {
    return (
      <div className="field">
        <label className="q" htmlFor={q.id}>{q.prompt}{req}</label>
        {q.help_text ? <div className="help">{q.help_text}</div> : null}
        <textarea id={q.id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  const type = q.input_type === "number" ? "number" : "text";
  return (
    <div className="field">
      <label className="q" htmlFor={q.id}>{q.prompt}{req}</label>
      {q.help_text ? <div className="help">{q.help_text}</div> : null}
      <input id={q.id} type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function missingRequired(questions, answers) {
  for (const q of questions) {
    if (!q.is_required) continue;
    const v = answers[q.id];
    if (v === undefined || v === null) return true;
    if (Array.isArray(v) && v.length === 0) return true;
    if (!Array.isArray(v) && String(v).trim() === "") return true;
  }
  return false;
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get("t") || "";

  const [view, setView] = useState(tokenFromUrl ? "status" : "positions");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [season, setSeason] = useState(null);
  const [positions, setPositions] = useState([]);
  const [position, setPosition] = useState(null);

  const [precheckQs, setPrecheckQs] = useState([]);
  const [precheckAnswers, setPrecheckAnswers] = useState({});
  const [precheckId, setPrecheckId] = useState("");

  const [appQs, setAppQs] = useState([]);
  const [appAnswers, setAppAnswers] = useState({});
  const [contact, setContact] = useState({ full_name: "", email: "", phone: "" });
  const [resume, setResume] = useState(null);
  const [newToken, setNewToken] = useState("");

  const [status, setStatus] = useState(null);
  const [packet, setPacket] = useState(null);
  const [ackName, setAckName] = useState("");
  const [assessment, setAssessment] = useState(null);
  const [assessAnswers, setAssessAnswers] = useState({});
  const [remaining, setRemaining] = useState(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (view === "positions") {
      post("get_positions", {})
        .then((d) => { setSeason(d.season); setPositions(d.positions || []); })
        .catch((e) => setError(e.message));
    }
    if (view === "status" && tokenFromUrl) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshStatus() {
    setError("");
    post("get_status", { token: tokenFromUrl })
      .then(setStatus)
      .catch((e) => setError(e.message));
  }

  async function startApply(p) {
    setError("");
    setBusy(true);
    try {
      const d = await post("get_precheck", { position_slug: p.slug });
      setPosition(p);
      setPrecheckAnswers({});
      if ((d.questions || []).length === 0) {
        await loadApplication(p, "");
      } else {
        setPrecheckQs(d.questions);
        setView("precheck");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    window.scrollTo(0, 0);
  }

  async function loadApplication(p, pcId) {
    const d = await post("get_application", { position_slug: p.slug });
    setAppQs(d.questions || []);
    setAppAnswers({});
    setPrecheckId(pcId);
    setView("application");
  }

  async function submitPrecheck() {
    if (missingRequired(precheckQs, precheckAnswers)) {
      setError("Please answer every question.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const d = await post("submit_precheck", { position_slug: position.slug, answers: precheckAnswers });
      if (d.passed) {
        await loadApplication(position, d.precheck_id);
      } else {
        setView("precheck_end");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    window.scrollTo(0, 0);
  }

  async function submitApplication() {
    setError("");
    if (!contact.full_name.trim() || !contact.email.trim() || !contact.phone.trim()) {
      setError("Please fill in your name, email, and phone.");
      return;
    }
    if (!resume) {
      setError("Please attach your resume (PDF or Word).");
      return;
    }
    if (missingRequired(appQs, appAnswers)) {
      setError("Please answer every required question.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("position_slug", position.slug);
      form.set("full_name", contact.full_name.trim());
      form.set("email", contact.email.trim());
      form.set("phone", contact.phone.trim());
      form.set("precheck_id", precheckId);
      form.set("answers", JSON.stringify(appAnswers));
      form.set("company_website", "");
      form.set("resume", resume);
      const d = await postForm(form);
      setNewToken(d.access_token);
      setView("submitted");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    window.scrollTo(0, 0);
  }

  async function openPacket() {
    setError("");
    setBusy(true);
    try {
      const d = await post("get_packet", { token: tokenFromUrl });
      setPacket(d);
      setView("packet");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    window.scrollTo(0, 0);
  }

  async function acknowledgePacket() {
    if (!ackName.trim()) {
      setError("Type your full name to confirm.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await post("acknowledge_packet", { token: tokenFromUrl, statement: ackName.trim() });
      setPacket(null);
      setView("status");
      refreshStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    window.scrollTo(0, 0);
  }

  async function openAssessment() {
    setError("");
    setBusy(true);
    try {
      const d = await post("get_assessment", { token: tokenFromUrl });
      if (!d.available) {
        setError("Your assessment is not ready yet. Check back soon.");
        return;
      }
      if (d.already_submitted) {
        refreshStatus();
        setError("");
        setView("status");
        return;
      }
      setAssessment(d);
      setAssessAnswers({});
      submittedRef.current = false;
      if (d.due_at) {
        const offset = new Date(d.server_now).getTime() - Date.now();
        const due = new Date(d.due_at).getTime();
        setRemaining(Math.max(0, due - (Date.now() + offset)));
      } else {
        setRemaining(null);
      }
      setView("assessment");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    window.scrollTo(0, 0);
  }

  const assessAnswersRef = useRef(assessAnswers);
  assessAnswersRef.current = assessAnswers;

  async function submitAssessment(auto) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setError("");
    setBusy(true);
    try {
      await post("submit_assessment", { token: tokenFromUrl, answers: assessAnswersRef.current });
      setAssessment(null);
      setView("assessment_done");
    } catch (e) {
      submittedRef.current = false;
      setError((auto ? "Time ran out and " : "") + e.message);
    } finally {
      setBusy(false);
    }
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    if (view !== "assessment" || remaining === null) return;
    const iv = setInterval(() => {
      setRemaining((r) => {
        if (r === null) return r;
        const next = r - 1000;
        if (next <= 0) {
          clearInterval(iv);
          submitAssessment(true);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, assessment]);

  const timerText = useMemo(() => {
    if (remaining === null) return null;
    const s = Math.max(0, Math.floor(remaining / 1000));
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return m + ":" + ss;
  }, [remaining]);

  let body = null;

  if (view === "positions") {
    body = (
      <>
        <div className="hero">
          <h1>Join our team for the 2027 tax season</h1>
          <p>Family Tax is a family owned firm serving thousands of families every season from our Stevenson Ranch office. We hire people who care about doing careful work and treating clients like neighbors.</p>
          {season ? (
            <div className="season-line">Paid training begins {season.training_start ? new Date(season.training_start + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "in January"}. The season runs through April.</div>
          ) : null}
        </div>
        {error ? <div className="error">{error}</div> : null}
        <div className="card">
          <h3>What we expect from everyone</h3>
          <p>Our clients trust us with their finances, so our team looks and acts like tax professionals, and we do careful, honest work on every file. Attire is business formal, always. We occasionally call a business casual day during tax season, but that is rare. No visible tattoos and no facial piercings at work.</p>
          <div className="req-title">Every role requires</div>
          <ul className="req-list">
            <li>Bilingual in English and Spanish</li>
            <li>Prior work experience</li>
            <li>Comfortable with technology, with fast and accurate typing</li>
            <li>Able to write professional, well-formatted texts and emails</li>
            <li>Solid customer service basics</li>
            <li>Two letters of recommendation, included in the same file as your resume</li>
            <li>Reliable attendance for the full season, from January training through April</li>
          </ul>
          <p className="fineprint">We provide reasonable accommodations for religious practices and medical needs as required by law.</p>
        </div>
        {positions.length === 0 && !error ? <div className="notice">No positions are open right now. Check back soon.</div> : null}
        {positions.map((p) => (
          <div className="card" key={p.slug}>
            <h3>{p.title}</h3>
            <div className="meta">
              {fmtPay(p) ? <span className="pay">{fmtPay(p)}</span> : null}
              {p.location_label ? <span>{p.location_label}</span> : null}
              {p.schedule_label ? <span>{p.schedule_label}</span> : null}
            </div>
            {p.description ? <p>{p.description}</p> : null}
            {Array.isArray(p.requirements) && p.requirements.length > 0 ? (
              <>
                <div className="req-title">What you'll need</div>
                <ul className="req-list">
                  {p.requirements.map((r, i) => <li key={i}>{String(r)}</li>)}
                </ul>
              </>
            ) : null}
            <button className="btn" disabled={busy} onClick={() => startApply(p)}>Apply for this role</button>
          </div>
        ))}
      </>
    );
  }

  if (view === "precheck") {
    body = (
      <>
        <h1>Before you apply</h1>
        <p>A few quick questions about the {position.title} role. This takes about a minute.</p>
        {error ? <div className="error">{error}</div> : null}
        {precheckQs.map((q) => (
          <QuestionField key={q.id} q={q} value={precheckAnswers[q.id]} onChange={(v) => setPrecheckAnswers((a) => ({ ...a, [q.id]: v }))} />
        ))}
        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={submitPrecheck}>{busy ? "Checking..." : "Continue"}</button>
          <button className="btn btn-quiet" disabled={busy} onClick={() => { setView("positions"); setError(""); }}>Back</button>
        </div>
      </>
    );
  }

  if (view === "precheck_end") {
    body = (
      <>
        <h1>Thank you for your interest</h1>
        <p>We appreciate you taking the time to look at the {position ? position.title : ""} role. Based on your answers, this particular position is not a match for this season.</p>
        <p>We hire every year, and things change. We would be glad to see you apply again for a future season.</p>
        <a className="btn btn-quiet" href="/">Back to open positions</a>
      </>
    );
  }

  if (view === "application") {
    body = (
      <>
        <h1>Apply: {position.title}</h1>
        <p>Tell us about yourself and attach your resume. Every application is read by a person.</p>
        {error ? <div className="error">{error}</div> : null}
        <div className="field">
          <label className="q" htmlFor="full_name">Full name<span className="req"> *</span></label>
          <input id="full_name" type="text" autoComplete="name" value={contact.full_name} onChange={(e) => setContact((c) => ({ ...c, full_name: e.target.value }))} />
        </div>
        <div className="field">
          <label className="q" htmlFor="email">Email<span className="req"> *</span></label>
          <input id="email" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
        </div>
        <div className="field">
          <label className="q" htmlFor="phone">Phone<span className="req"> *</span></label>
          <input id="phone" type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
        </div>
        {appQs.map((q) => (
          <QuestionField key={q.id} q={q} value={appAnswers[q.id]} onChange={(v) => setAppAnswers((a) => ({ ...a, [q.id]: v }))} />
        ))}
        <div className="field">
          <label className="q" htmlFor="resume">Resume with 2 letters of recommendation (PDF or Word)<span className="req"> *</span></label>
          <input id="resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setResume(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
        </div>
        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={submitApplication}>{busy ? "Submitting..." : "Submit application"}</button>
          <button className="btn btn-quiet" disabled={busy} onClick={() => { setView("positions"); setError(""); window.scrollTo(0, 0); }}>Back</button>
        </div>
      </>
    );
  }

  if (view === "submitted") {
    const link = window.location.origin + "/?t=" + newToken;
    body = (
      <>
        <h1>Application received</h1>
        <p>Thank you. Your application for {position.title} is in, and a real person will review it.</p>
        <div className="notice"><strong>Save this link.</strong> It is your private application page. You will use it to read your information packet and take your assessment as you move forward.</div>
        <div className="linkbox">{link}</div>
        <div className="btn-row">
          <button className="btn" onClick={() => { navigator.clipboard.writeText(link).catch(() => {}); }}>Copy link</button>
          <a className="btn btn-quiet" href={link}>Open my application page</a>
        </div>
      </>
    );
  }

  if (view === "status") {
    if (!status && !error) body = <p>Loading your application...</p>;
    else if (error && !status) body = <><h1>Hmm.</h1><div className="error">{error}</div><p>Check that you opened your full private link, exactly as it was given to you.</p></>;
    else if (status && status.terminal) {
      body = (
        <>
          <h1>Hi {status.first_name}</h1>
          {status.stage === "withdrawn" ? (
            <p>Your application for {status.position} has been withdrawn. If that was a mistake, call our office and we will sort it out.</p>
          ) : (
            <><p>Thank you for applying for {status.position} and for the time you put into the process. We are not moving forward with your application this season.</p><p>We hire every year, and we would be glad to see you apply again.</p></>
          )}
        </>
      );
    } else if (status) {
      const idx = stepIndexFor(status.stage);
      body = (
        <>
          <h1>Hi {status.first_name}</h1>
          <p>Here is where your application for <strong>{status.position}</strong> stands.</p>
          {error ? <div className="error">{error}</div> : null}
          <ol className="rail">
            {STEPS.map((s, i) => (
              <li key={s.n} className={i < idx ? "done" : i === idx ? "now" : ""}>
                <span className="dot">{i < idx ? "\u2713" : s.n}</span>
                <span>
                  <span className="step-name">{s.name}</span><br />
                  <span className="step-note">{s.note}</span>
                </span>
              </li>
            ))}
          </ol>
          {status.packet_available && !status.packet_acknowledged ? (
            <div className="card">
              <h3>Your information packet is ready</h3>
              <p>Read it carefully. It explains what the season asks of you. You will confirm you have read it before moving on.</p>
              <button className="btn" disabled={busy} onClick={openPacket}>Read my packet</button>
            </div>
          ) : null}
          {status.packet_acknowledged && status.assessment_available && status.assessment_status !== "submitted" && status.assessment_status !== "graded" ? (
            <div className="card">
              <h3>Your online assessment</h3>
              <p>Set aside quiet, uninterrupted time. If the assessment has a time limit, the clock starts the moment you begin, and you get one attempt.</p>
              <button className="btn" disabled={busy} onClick={openAssessment}>Begin assessment</button>
            </div>
          ) : null}
          {status.assessment_status === "submitted" || status.assessment_status === "graded" ? (
            <div className="notice">Your assessment has been submitted. We will be in touch about next steps.</div>
          ) : null}
          {status.packet_available && status.packet_acknowledged ? (
            <p><button className="btn btn-quiet" disabled={busy} onClick={openPacket}>Re-read my packet</button></p>
          ) : null}
        </>
      );
    }
  }

  if (view === "packet" && packet) {
    body = (
      <>
        <h1>{packet.title}</h1>
        {error ? <div className="error">{error}</div> : null}
        {packet.content_md ? <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(packet.content_md) }} /> : null}
        {packet.file_url ? <p><a className="btn btn-quiet" href={packet.file_url} target="_blank" rel="noreferrer">Open packet PDF</a></p> : null}
        {!packet.acknowledged_at ? (
          <div className="card">
            <h3>Confirm you have read this</h3>
            <p>Type your full name below. This records the date and time of your acknowledgment.</p>
            <div className="field">
              <input type="text" placeholder="Your full name" value={ackName} onChange={(e) => setAckName(e.target.value)} />
            </div>
            <button className="btn" disabled={busy} onClick={acknowledgePacket}>{busy ? "Saving..." : "I have read and understood the packet"}</button>
          </div>
        ) : (
          <div className="notice">You acknowledged this packet on {new Date(packet.acknowledged_at).toLocaleDateString()}.</div>
        )}
        <p><button className="btn btn-quiet" onClick={() => { setView("status"); refreshStatus(); }}>Back to my application</button></p>
      </>
    );
  }

  if (view === "assessment" && assessment) {
    body = (
      <>
        <h1>{assessment.assessment.title}</h1>
        {assessment.assessment.instructions ? <p>{assessment.assessment.instructions}</p> : null}
        {timerText !== null ? <div className={"timer" + (remaining !== null && remaining < 120000 ? " low" : "")}>Time remaining: {timerText}</div> : null}
        {error ? <div className="error">{error}</div> : null}
        {assessment.questions.map((q, i) => (
          <div className="card" key={q.id}>
            <div className="eyebrow" style={{ color: "var(--red)" }}>Question {i + 1}{q.points ? " \u00b7 " + q.points + (Number(q.points) === 1 ? " point" : " points") : ""}</div>
            {q.attachment_url ? <p><a href={q.attachment_url} target="_blank" rel="noreferrer">Open the attached document</a></p> : null}
            <QuestionField
              q={{ id: q.id, prompt: q.prompt, help_text: null, input_type: q.qtype === "multiple_choice" ? "select" : q.qtype === "multi_select" ? "multi_select" : "long_text", options: q.options, is_required: false }}
              value={assessAnswers[q.id]}
              onChange={(v) => setAssessAnswers((a) => ({ ...a, [q.id]: v }))}
            />
          </div>
        ))}
        <button className="btn" disabled={busy} onClick={() => submitAssessment(false)}>{busy ? "Submitting..." : "Submit assessment"}</button>
      </>
    );
  }

  if (view === "assessment_done") {
    body = (
      <>
        <h1>Assessment submitted</h1>
        <p>Nice work. Your answers are in, and we will review them and reach out about next steps.</p>
        <a className="btn btn-quiet" href={"/?t=" + tokenFromUrl}>Back to my application</a>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="wrap">{body}</div>
      <Footer />
    </>
  );
}
