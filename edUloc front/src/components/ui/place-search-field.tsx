import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";

import { isApiError } from "@/api/errors";
import { LocationIcon, SearchIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { LocationService, type ResolvedLocation } from "@/services/location.service";
import { useTranslation } from "react-i18next";

type PlaceSearchFieldProps = {
  placeholder?: string;
  /** Appelé quand l'utilisateur choisit une suggestion (adresse géocodée : libellé + coordonnées). */
  onSelect: (place: ResolvedLocation) => void;
  disabled?: boolean;
  /** Texte initial du champ. */
  initialQuery?: string;
};

const MIN_CHARS = 3;
const DEBOUNCE_MS = 450;

/**
 * Recherche d'adresse / de quartier avec suggestions. La saisie est géocodée par le serveur (limité à
 * Madagascar) après une courte pause ; l'utilisateur CHOISIT une suggestion, ce qui garantit des
 * coordonnées valides (la recherche de tuteurs est géographique).
 */
export function PlaceSearchField({ placeholder, onSelect, disabled, initialQuery = "" }: PlaceSearchFieldProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ResolvedLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const text = query.trim();
    const tooShort = text.length < MIN_CHARS;
    const current = ++requestId.current;
    const timer = setTimeout(async () => {
      if (tooShort) {
        setResults([]);
        setSearched(false);
        setError(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const places = await LocationService.searchPlaces(text);
        if (current !== requestId.current) return; // une saisie plus récente a pris le relais
        setResults(places);
        setSearched(true);
      } catch (e) {
        if (current !== requestId.current) return;
        setResults([]);
        setError(isApiError(e) ? e.message : t("ui.placeSearchField.searchIsUnavailableAtThe"));
      } finally {
        if (current === requestId.current) setSearching(false);
      }
    }, tooShort ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const choose = (place: ResolvedLocation) => {
    requestId.current += 1; // annule toute recherche en cours
    setResults([]);
    setSearched(false);
    setQuery(place.label);
    onSelect(place);
  };

  return (
    <View>
      <View className="flex-row items-center gap-[10px] rounded-sm border border-line bg-surface px-[14px] py-[12px]">
        <SearchIcon size={17} color="#9799AF" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          editable={!disabled}
          placeholder={placeholder ?? t("ui.placeSearchField.searchForAnAddressA")}
          placeholderTextColor="#9799AF"
          className="flex-1 text-[15px] text-ink"
          autoCorrect={false}
          accessibilityLabel={t("ui.placeSearchField.searchForAnAddress")}
        />
        {searching ? <ActivityIndicator size="small" color="#332E86" /> : null}
      </View>

      {error ? <Text className="mt-2 text-[12.5px] text-error">{error}</Text> : null}

      {results.length > 0 ? (
        <View className="mt-2 overflow-hidden rounded-sm border border-line bg-surface">
          {results.map((place, index) => (
            <PressableScale key={`${place.latitude},${place.longitude},${index}`} onPress={() => choose(place)} accessibilityLabel={t("ui.placeSearchField.choose", { label: place.label })}>
              <View className={["flex-row items-center gap-3 px-[14px] py-[12px]", index > 0 ? "border-t border-line-soft" : ""].join(" ")}>
                <LocationIcon size={16} color="#332E86" />
                <Text className="flex-1 text-[14px] text-ink" numberOfLines={2}>
                  {place.label}
                </Text>
              </View>
            </PressableScale>
          ))}
        </View>
      ) : searched && !searching && !error ? (
        <Text className="mt-2 text-[12.5px] text-ink-soft">
          {t("ui.placeSearchField.noAddressFoundTryA")}</Text>
      ) : null}
    </View>
  );
}
