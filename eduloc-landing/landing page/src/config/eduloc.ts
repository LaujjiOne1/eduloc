/**
 * Configuration centrale EduLoc.
 * Renseignez ces valeurs dès qu'elles sont disponibles.
 * Tant qu'une valeur est vide, le bouton correspondant est masqué ou affiché comme « bientôt disponible ».
 */
export const edulocConfig = {
  /** URL publique de l'APK Android (ex : https://…/eduloc.apk). */
  apkDownloadUrl: "",
  /** Version affichée à côté du bouton de téléchargement (optionnel). */
  apkVersion: "",
  /** Numéro de téléphone du service client au format international, ex : "+33612345678". */
  phone: "",
  /** Numéro WhatsApp au format international, chiffres uniquement, ex : "33612345678". */
  whatsapp: "",
  /** Adresse e-mail du service client. */
  email: "",
  /** Horaires du service client (texte libre), ex : "Lun–Sam, 8h–20h". */
  hours: "",
  /**
   * Endpoint futur de la console agent EduLoc.
   * Aujourd'hui les demandes sont enregistrées dans la base du site ;
   * une fois la console prête, elles pourront y être relayées.
   */
  agentConsoleEndpoint: "",
};

export const hasApk = () => edulocConfig.apkDownloadUrl.trim() !== "";
export const hasPhone = () => edulocConfig.phone.trim() !== "";
export const hasWhatsapp = () => edulocConfig.whatsapp.trim() !== "";
export const hasEmail = () => edulocConfig.email.trim() !== "";
export const hasDirectChannel = () => hasPhone() || hasWhatsapp() || hasEmail();

export const telLink = () => `tel:${edulocConfig.phone.replace(/\s/g, "")}`;
export const whatsappLink = (text?: string) =>
  `https://wa.me/${edulocConfig.whatsapp.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text.slice(0, 1500))}` : ""}`;
export const mailLink = () => `mailto:${edulocConfig.email}`;
