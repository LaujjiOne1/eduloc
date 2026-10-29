import { useMemo, useState } from "react";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, GraduationCap, HelpCircle, Loader2, MessageCircle, Phone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { edulocConfig, hasPhone, hasWhatsapp, telLink, whatsappLink } from "@/config/eduloc";
import { cn } from "@/lib/utils";

type Question = { id: string; label: string; type: "chips" | "text"; options?: string[]; optional?: boolean; placeholder?: string };
type Category = { id: "trouver_tuteur" | "cours_proche" | "reservation" | "autre"; title: string; desc: string; icon: typeof Users; questions: Question[] };

const LEVELS = ["Primaire", "Collège", "Lycée", "Supérieur", "Adulte / pro"];
const SUBJECTS = ["Mathématiques", "Français", "Anglais", "Physique-Chimie", "SVT", "Aide aux devoirs", "Autre"];
const FORMAT = ["À domicile", "En ligne", "Peu importe"];
const FREQ = ["Ponctuel", "1×/semaine", "2×/semaine ou plus", "Stage intensif"];

const CATEGORIES: Category[] = [
  {
    id: "trouver_tuteur", title: "Trouver un tuteur pour moi", desc: "Vous souhaitez progresser vous-même.", icon: GraduationCap,
    questions: [
      { id: "niveau", label: "Quel est votre niveau ?", type: "chips", options: LEVELS },
      { id: "matiere", label: "Dans quelle matière ?", type: "chips", options: SUBJECTS },
      { id: "format", label: "Quel format préférez-vous ?", type: "chips", options: FORMAT },
      { id: "frequence", label: "À quelle fréquence ?", type: "chips", options: FREQ },
      { id: "ville", label: "Ville ou quartier", type: "text", placeholder: "Ex : Lyon 3e", optional: true },
    ],
  },
  {
    id: "cours_proche", title: "Organiser des cours pour un proche", desc: "Pour votre enfant ou un membre de la famille.", icon: Users,
    questions: [
      { id: "pour", label: "Pour qui ?", type: "chips", options: ["Mon enfant", "Un autre proche"] },
      { id: "niveau", label: "Quel est son niveau ?", type: "chips", options: LEVELS },
      { id: "matiere", label: "Dans quelle matière ?", type: "chips", options: SUBJECTS },
      { id: "format", label: "Quel format ?", type: "chips", options: FORMAT },
      { id: "frequence", label: "À quelle fréquence ?", type: "chips", options: FREQ },
      { id: "ville", label: "Ville ou quartier", type: "text", placeholder: "Ex : Bordeaux centre", optional: true },
    ],
  },
  {
    id: "reservation", title: "Aide sur une réservation", desc: "Une question sur un cours déjà prévu.", icon: CalendarCheck,
    questions: [
      { id: "sujet", label: "De quoi s'agit-il ?", type: "chips", options: ["Modifier un cours", "Annuler un cours", "Tuteur absent", "Paiement", "Autre"] },
      { id: "reference", label: "Nom du tuteur ou date du cours", type: "text", placeholder: "Facultatif", optional: true },
    ],
  },
  { id: "autre", title: "Autre question", desc: "Devenir tuteur, partenariat, autre…", icon: HelpCircle, questions: [] },
];

const contactSchema = z
  .object({
    full_name: z.string().trim().min(2, "Indiquez votre nom").max(100),
    phone: z.string().trim().max(30).regex(/^[+\d\s().-]*$/, "Numéro invalide"),
    email: z.string().trim().max(255).refine((v) => v === "" || z.string().email().safeParse(v).success, "E-mail invalide"),
    preferred_channel: z.string(),
    message: z.string().trim().max(2000),
  })
  .refine((d) => d.phone !== "" || d.email !== "", { message: "Indiquez un téléphone ou un e-mail", path: ["phone"] });

type Step = "category" | "questions" | "contact" | "done";

export const GuidedAssistant = () => {
  const [step, setStep] = useState<Step>("category");
  const [cat, setCat] = useState<Category | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", preferred_channel: "Téléphone", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [reference, setReference] = useState("");

  const summary = useMemo(() => {
    if (!cat) return "";
    const lines = cat.questions.filter((q) => answers[q.id]).map((q) => `${q.label} ${answers[q.id]}`);
    return [`Demande edUloc : ${cat.title}`, ...lines].join("\n");
  }, [cat, answers]);

  const pickCategory = (c: Category) => {
    setCat(c); setAnswers({}); setQIndex(0);
    setStep(c.questions.length ? "questions" : "contact");
  };
  const q = cat?.questions[qIndex];
  const nextQ = () => (cat && qIndex < cat.questions.length - 1 ? setQIndex(qIndex + 1) : setStep("contact"));
  const back = () => {
    if (step === "contact" && cat?.questions.length) { setStep("questions"); setQIndex(cat.questions.length - 1); }
    else if (step === "questions" && qIndex > 0) setQIndex(qIndex - 1);
    else setStep("category");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError("");
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (errs[i.path[0] as string] = i.message));
      setErrors(errs); return;
    }
    setErrors({});
    setSending(true);
    const id = crypto.randomUUID();
    const d = parsed.data;
    const { error } = await supabase.from("support_requests").insert({
      id, category: cat!.id, details: answers, full_name: d.full_name,
      phone: d.phone || null, email: d.email || null, preferred_channel: d.preferred_channel, message: d.message || null,
    });
    setSending(false);
    if (error) { setSendError("Votre demande n'a pas pu être enregistrée. Réessayez dans un instant" + (hasWhatsapp() || hasPhone() ? " ou contactez-nous directement." : ".")); return; }
    setReference(id.slice(0, 8).toUpperCase());
    setStep("done");
  };

  const reset = () => { setStep("category"); setCat(null); setAnswers({}); setForm({ full_name: "", phone: "", email: "", preferred_channel: "Téléphone", message: "" }); };
  const totalSteps = (cat?.questions.length ?? 0) + 2;
  const current = step === "category" ? 1 : step === "questions" ? qIndex + 2 : totalSteps;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className="flex items-center justify-between border-b bg-violet-tint px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"><MessageCircle className="h-4 w-4" /></span>
          <div>
            <p className="font-display font-bold leading-tight">Assistant edUloc</p>
            <p className="text-xs text-muted-foreground">Quelques questions pour bien vous orienter</p>
          </div>
        </div>
        {step !== "done" && <span className="text-xs font-medium text-muted-foreground">Étape {current}/{cat ? totalSteps : "…"}</span>}
      </div>
      {step !== "done" && cat && <div className="h-1 bg-muted"><div className="h-full bg-glow transition-all" style={{ width: `${(current / totalSteps) * 100}%` }} /></div>}

      <div className="p-5 sm:p-7">
        {step === "category" && (
          <div>
            <h3 className="mb-4 text-xl">Comment pouvons-nous vous aider ?</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {CATEGORIES.map((c) => (
                <button key={c.id} onClick={() => pickCategory(c)} className="group flex items-start gap-3 rounded-xl border bg-background p-4 text-left transition hover:border-primary hover:bg-primary-tint">
                  <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span><span className="block font-semibold">{c.title}</span><span className="text-sm text-muted-foreground">{c.desc}</span></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "questions" && q && (
          <div key={q.id + qIndex} className="animate-in fade-in slide-in-from-right-4 duration-300">
            <p className="mb-1 text-sm font-medium text-primary">{cat!.title}</p>
            <h3 className="mb-5 text-xl">{q.label}</h3>
            {q.type === "chips" ? (
              <div className="flex flex-wrap gap-2">
                {q.options!.map((o) => (
                  <button key={o} onClick={() => { setAnswers({ ...answers, [q.id]: o }); setTimeout(nextQ, 150); }}
                    className={cn("rounded-full border px-4 py-2 text-sm font-medium transition", answers[q.id] === o ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary hover:bg-primary-tint")}>
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <Input value={answers[q.id] ?? ""} maxLength={120} placeholder={q.placeholder} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && nextQ()} />
            )}
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={back}><ArrowLeft className="mr-1 h-4 w-4" />Retour</Button>
              {(q.type === "text" || answers[q.id]) && (
                <Button onClick={nextQ} disabled={!q.optional && !answers[q.id]}>{q.optional && !answers[q.id] ? "Passer" : "Continuer"}<ArrowRight className="ml-1 h-4 w-4" /></Button>
              )}
            </div>
          </div>
        )}

        {step === "contact" && cat && (
          <form onSubmit={submit} className="animate-in fade-in duration-300" noValidate>
            {cat.questions.length > 0 && (
              <div className="mb-5 rounded-xl bg-primary-tint p-4 text-sm">
                <p className="mb-2 font-semibold text-primary">Votre besoin</p>
                <ul className="flex flex-wrap gap-1.5">
                  {Object.values(answers).filter(Boolean).map((v, i) => <li key={i} className="rounded-full bg-card px-2.5 py-0.5">{v}</li>)}
                </ul>
              </div>
            )}

            <h3 className="mb-1 text-xl">Meilleure prochaine étape</h3>
            {hasWhatsapp() ? (
              <div className="mb-5 mt-3 flex flex-col gap-2 sm:flex-row">
                <Button asChild className="bg-emerald hover:bg-emerald/90"><a href={whatsappLink(summary)} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" />Envoyer sur WhatsApp</a></Button>
                {hasPhone() && <Button asChild variant="outline"><a href={telLink()}><Phone className="mr-2 h-4 w-4" />Appeler un conseiller</a></Button>}
              </div>
            ) : hasPhone() ? (
              <Button asChild variant="outline" className="mb-5 mt-3"><a href={telLink()}><Phone className="mr-2 h-4 w-4" />Appeler un conseiller</a></Button>
            ) : null}
            <p className="mb-4 text-sm text-muted-foreground">
              {hasWhatsapp() || hasPhone() ? "Ou laissez vos coordonnées : un conseiller vous recontacte." : "Laissez vos coordonnées : un conseiller edUloc vous recontacte pour vous proposer un tuteur."}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom complet" error={errors.full_name} className="sm:col-span-2">
                <Input value={form.full_name} maxLength={100} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoComplete="name" />
              </Field>
              <Field label="Téléphone" error={errors.phone}>
                <Input type="tel" value={form.phone} maxLength={30} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
              </Field>
              <Field label="E-mail" error={errors.email}>
                <Input type="email" value={form.email} maxLength={255} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
              </Field>
              <Field label="Être recontacté par" className="sm:col-span-2">
                <div className="flex flex-wrap gap-2">
                  {["Téléphone", "WhatsApp", "E-mail"].map((c) => (
                    <button type="button" key={c} onClick={() => setForm({ ...form, preferred_channel: c })}
                      className={cn("rounded-full border px-3.5 py-1.5 text-sm transition", form.preferred_channel === c ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-primary-tint")}>{c}</button>
                  ))}
                </div>
              </Field>
              <Field label={cat.id === "autre" ? "Votre message" : "Précisions (facultatif)"} className="sm:col-span-2">
                <Textarea rows={3} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Disponibilités, objectifs, difficultés…" />
              </Field>
            </div>
            {sendError && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{sendError}</p>}
            <div className="mt-6 flex justify-between">
              <Button type="button" variant="ghost" onClick={back}><ArrowLeft className="mr-1 h-4 w-4" />Retour</Button>
              <Button type="submit" disabled={sending}>{sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Envoyer ma demande</Button>
            </div>
          </form>
        )}

        {step === "done" && (
          <div className="py-6 text-center animate-in fade-in zoom-in-95 duration-300">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald" />
            <h3 className="text-2xl">Demande enregistrée</h3>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              Votre demande a bien été enregistrée sous la référence <span className="font-semibold text-foreground">{reference}</span>. Un conseiller edUloc vous recontactera {form.preferred_channel === "E-mail" ? "par e-mail" : `par ${form.preferred_channel.toLowerCase()}`}{edulocConfig.hours ? ` (${edulocConfig.hours})` : ""}.
            </p>
            <Button variant="outline" className="mt-6" onClick={reset}>Nouvelle demande</Button>
          </div>
        )}
      </div>
    </div>
  );
};

const Field = ({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) => (
  <div className={cn("space-y-1.5", className)}>
    <Label>{label}</Label>
    {children}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);
