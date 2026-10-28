import type { DeepString } from "../../types";
import type { fr } from "../fr";
import api from "./api.json";
import apprentiDashboard from "./apprentiDashboard.json";
import availability from "./availability.json";
import beneficiaries from "./beneficiaries.json";
import booking from "./booking.json";
import call from "./call.json";
import chat from "./chat.json";
import common from "./common.json";
import date from "./date.json";
import hooks from "./hooks.json";
import lib from "./lib.json";
import map from "./map.json";
import partner from "./partner.json";
import partnerDashboard from "./partnerDashboard.json";
import realtime from "./realtime.json";
import results from "./results.json";
import screens from "./screens.json";
import search from "./search.json";
import services from "./services.json";
import tutorDashboard from "./tutorDashboard.json";
import tutorOnboarding from "./tutorOnboarding.json";
import ui from "./ui.json";

/** Malagasy — la compilation échoue si une clé du français manque ici. */
export const mg: DeepString<typeof fr> = {
  api,
  apprentiDashboard,
  availability,
  beneficiaries,
  booking,
  call,
  chat,
  common,
  date,
  hooks,
  lib,
  map,
  partner,
  partnerDashboard,
  realtime,
  results,
  screens,
  search,
  services,
  tutorDashboard,
  tutorOnboarding,
  ui,
};
