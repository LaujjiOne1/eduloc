import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { CheckIcon, ChevronRightIcon, SearchIcon, XIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";
import { t as translate } from "@/i18n";

export type CountryItem = {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  placeholder: string;
  format: string; // example visual guide
};

export const COUNTRIES: CountryItem[] = [
  { code: "MG", get name() { return tr("ui.phoneInputField.madagascar"); }, dialCode: "+261", flag: "🇲🇬", placeholder: "34 00 000 00", format: "## ## ### ##" },
  { code: "FR", get name() { return tr("ui.phoneInputField.france"); }, dialCode: "+33", flag: "🇫🇷", placeholder: "6 12 34 56 78", format: "# ## ## ## ##" },
  { code: "RE", get name() { return tr("ui.phoneInputField.reunion"); }, dialCode: "+262", flag: "🇷🇪", placeholder: "692 00 00 00", format: "### ## ## ##" },
  { code: "KM", get name() { return tr("ui.phoneInputField.comoros"); }, dialCode: "+269", flag: "🇰🇲", placeholder: "32 00 000", format: "## ## ###" },
  { code: "MU", get name() { return tr("ui.phoneInputField.mauritius"); }, dialCode: "+230", flag: "🇲🇺", placeholder: "5123 4567", format: "#### ####" },
  { code: "YT", get name() { return tr("ui.phoneInputField.mayotte"); }, dialCode: "+262", flag: "🇾🇹", placeholder: "639 00 00 00", format: "### ## ## ##" },
  { code: "CA", get name() { return tr("ui.phoneInputField.canada"); }, dialCode: "+1", flag: "🇨🇦", placeholder: "514 123 4567", format: "### ### ####" },
  { code: "BE", get name() { return tr("ui.phoneInputField.belgium"); }, dialCode: "+32", flag: "🇧🇪", placeholder: "470 12 34 56", format: "### ## ## ##" },
  { code: "CH", get name() { return tr("ui.phoneInputField.switzerland"); }, dialCode: "+41", flag: "🇨🇭", placeholder: "79 123 45 67", format: "## ### ## ##" },
  { code: "SN", get name() { return tr("ui.phoneInputField.senegal"); }, dialCode: "+221", flag: "🇸🇳", placeholder: "77 123 45 67", format: "## ### ## ##" },
  { code: "CI", get name() { return tr("ui.phoneInputField.coteDIvoire"); }, dialCode: "+225", flag: "🇨🇮", placeholder: "07 12 34 56 78", format: "## ## ## ## ##" },
  { code: "MA", get name() { return tr("ui.phoneInputField.morocco"); }, dialCode: "+212", flag: "🇲🇦", placeholder: "6 12 34 56 78", format: "# ## ## ## ##" },
  { code: "DZ", get name() { return tr("ui.phoneInputField.algeria"); }, dialCode: "+213", flag: "🇩🇿", placeholder: "555 12 34 56", format: "### ## ## ##" },
  { code: "TN", get name() { return tr("ui.phoneInputField.tunisia"); }, dialCode: "+216", flag: "🇹🇳", placeholder: "20 123 456", format: "## ### ###" },
  { code: "US", get name() { return translate("ui.phoneInputField.unitedStates"); }, dialCode: "+1", flag: "🇺🇸", placeholder: "202 555 0123", format: "### ### ####" },
  { code: "GB", get name() { return translate("ui.phoneInputField.unitedKingdom"); }, dialCode: "+44", flag: "🇬🇧", placeholder: "7911 123456", format: "#### ######" },
  { code: "DE", get name() { return tr("ui.phoneInputField.germany"); }, dialCode: "+49", flag: "🇩🇪", placeholder: "151 2345678", format: "### #######" },
  { code: "ES", get name() { return tr("ui.phoneInputField.spain"); }, dialCode: "+34", flag: "🇪🇸", placeholder: "612 34 56 78", format: "### ## ## ##" },
  { code: "IT", get name() { return tr("ui.phoneInputField.italy"); }, dialCode: "+39", flag: "🇮🇹", placeholder: "312 3456789", format: "### #######" },
];

export type PhoneInputFieldProps = {
  label?: string;
  value: string;
  onChangeText: (fullPhoneNumber: string) => void;
  error?: string;
  disabled?: boolean;
};

/**
 * Format digits for pleasant spacing:
 * e.g. "340000000" -> "34 00 000 00" (Madagascar) or "612345678" -> "6 12 34 56 78" (France)
 */
function formatNationalDigits(digits: string, countryCode: string): string {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return "";

  if (countryCode === "MG") {
    // 9 digits: 34 12 345 67
    const parts = [
      clean.slice(0, 2),
      clean.slice(2, 4),
      clean.slice(4, 7),
      clean.slice(7, 9),
    ].filter(Boolean);
    return parts.join(" ");
  }

  if (countryCode === "FR") {
    // 9 digits: 6 12 34 56 78
    const parts = [
      clean.slice(0, 1),
      clean.slice(1, 3),
      clean.slice(3, 5),
      clean.slice(5, 7),
      clean.slice(7, 9),
    ].filter(Boolean);
    return parts.join(" ");
  }

  // General format: group in blocks of 2 or 3
  if (clean.length <= 6) {
    return clean.replace(/(\d{2})(?=\d)/g, "$1 ");
  }
  return clean.replace(/(\d{3})(?=\d)/g, "$1 ");
}

/**
 * Deconstruct an incoming full phone string (e.g. "+261 34 00 000 00" or "034 00 000 00")
 * into a matching CountryItem and the remaining national number digits.
 */
function parseFullPhone(raw: string): { country: CountryItem; national: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { country: COUNTRIES[0], national: "" };
  }

  // Match known dialCode prefixes
  for (const c of COUNTRIES) {
    if (trimmed.startsWith(c.dialCode)) {
      const rest = trimmed.slice(c.dialCode.length).trim();
      return { country: c, national: rest };
    }
  }

  // Local Madagascar number starting with 034, 032, 033, 038...
  if (trimmed.startsWith("0") && trimmed.length >= 9) {
    const withoutZero = trimmed.slice(1);
    return { country: COUNTRIES[0], national: withoutZero };
  }

  return { country: COUNTRIES[0], national: trimmed };
}

export function PhoneInputField({
  label = translate("ui.phoneInputField.phone"),
  value,
  onChangeText,
  error,
  disabled = false,
}: PhoneInputFieldProps) {
  const { t } = useTranslation();
  const initial = useMemo(() => parseFullPhone(value), [value]);

  const [selectedCountry, setSelectedCountry] = useState<CountryItem>(initial.country);
  const [nationalNumber, setNationalNumber] = useState<string>(initial.national);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  // Sync internal state when external value prop changes
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    const parsed = parseFullPhone(value);
    setSelectedCountry(parsed.country);
    setNationalNumber(parsed.national);
  }

  const updatePhone = (country: CountryItem, national: string) => {
    const cleanNational = national.trim();
    if (!cleanNational) {
      onChangeText("");
    } else {
      onChangeText(`${country.dialCode} ${cleanNational}`);
    }
  };

  const handleNationalChange = (text: string) => {
    // If user pastes a full international number like "+33 6 12 34 56 78"
    if (text.startsWith("+")) {
      const parsed = parseFullPhone(text);
      setSelectedCountry(parsed.country);
      const formatted = formatNationalDigits(parsed.national, parsed.country.code);
      setNationalNumber(formatted);
      updatePhone(parsed.country, formatted);
      return;
    }

    // Strip leading 0 if present in national digits
    let cleaned = text;
    if (cleaned.startsWith("0") && cleaned.length > 1) {
      cleaned = cleaned.slice(1);
    }

    const formatted = formatNationalDigits(cleaned, selectedCountry.code);
    setNationalNumber(formatted);
    updatePhone(selectedCountry, formatted);
  };

  const handleSelectCountry = (country: CountryItem) => {
    setSelectedCountry(country);
    setIsModalOpen(false);
    updatePhone(country, nationalNumber);
  };

  const handleClear = () => {
    setNationalNumber("");
    onChangeText("");
  };

  // Filtered countries for the modal search
  const filteredCountries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const digitsOnly = nationalNumber.replace(/\D/g, "");
  const isValidLength = digitsOnly.length >= 8 && digitsOnly.length <= 11;

  return (
    <View className="mb-[14px]">
      {/* Header Label + Status Badge */}
      <View className="mb-[6px] ml-0.5 flex-row items-center justify-between">
        <Text className="text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
          {label}
        </Text>
        <View className="flex-row items-center gap-1.5">
          {isValidLength ? (
            <View className="flex-row items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 border border-primary/20">
              <CheckIcon size={11} color="#332E86" />
              <Text className="text-[11px] font-bold text-primary">{t("ui.phoneInputField.validNumber")}</Text>
            </View>
          ) : (
            <Text className="text-[11.5px] font-medium text-ink-faint">
              {selectedCountry.flag} {selectedCountry.name}
            </Text>
          )}
        </View>
      </View>

      {/* Segmented Phone Input Container */}
      <View
        className={[
          "flex-row items-center rounded-sm border bg-surface transition-all",
          error
            ? "border-error"
            : isFocused
            ? "border-primary ring-1 ring-primary/20"
            : "border-line",
          disabled ? "opacity-50" : "",
        ].join(" ")}
      >
        {/* Country Selector Trigger */}
        <PressableScale
          onPress={() => !disabled && setIsModalOpen(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t("ui.phoneInputField.selectedCountryDialingCode", { name: selectedCountry.name, dialCode: selectedCountry.dialCode })}
        >
          <View className="flex-row items-center gap-1.5 px-3 py-[13px] hover:bg-paper/50">
            <Text className="text-[18px]">{selectedCountry.flag}</Text>
            <Text className="text-[14.5px] font-bold text-ink">
              {selectedCountry.dialCode}
            </Text>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <ChevronRightIcon size={13} color="#9799AF" />
            </View>
          </View>
        </PressableScale>

        {/* Vertical divider */}
        <View className="h-6 w-[1px] bg-line" />

        {/* National Number Input */}
        <TextInput
          value={nationalNumber}
          onChangeText={handleNationalChange}
          placeholder={selectedCountry.placeholder}
          placeholderTextColor="#9799AF"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          editable={!disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          accessibilityLabel={`${label} ${selectedCountry.dialCode}`}
          className="flex-1 px-3 py-[13px] text-[15px] font-medium text-ink"
        />

        {/* Clear Button */}
        {nationalNumber.length > 0 && !disabled && (
          <Pressable
            onPress={handleClear}
            className="mr-3 h-6 w-6 items-center justify-center rounded-full bg-paper hover:bg-line"
            accessibilityLabel={t("ui.phoneInputField.clearTheNumber")}
          >
            <XIcon size={12} color="#5D5F76" />
          </Pressable>
        )}
      </View>

      {/* Helper / Preview */}
      <View className="mt-1.5 ml-0.5 flex-row items-center justify-between">
        <Text className="text-[11.5px] text-ink-faint">
          {nationalNumber
            ? t("ui.phoneInputField.internationalFormat", { dialCode: selectedCountry.dialCode, nationalNumber })
            : t("ui.phoneInputField.eGWithoutTheLeading", { placeholder: selectedCountry.placeholder })}
        </Text>
      </View>

      {/* Error Message */}
      {error ? (
        <Text className="mb-0 mt-1 ml-0.5 text-[12.5px] text-error">{error}</Text>
      ) : null}

      {/* Country Selection Modal */}
      <Modal
        visible={isModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsModalOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(20,22,43,0.45)" }}
          onPress={() => setIsModalOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="max-h-[80%] rounded-t-2xl bg-paper shadow-xl"
            style={{ paddingBottom: 28 }}
          >
            {/* Modal Header */}
            <View className="flex-row items-center justify-between border-b border-line-soft px-5 py-4">
              <View>
                <Text className="text-[17px] font-bold text-ink">
                  {t("ui.phoneInputField.chooseACountryDialingCode")}</Text>
                <Text className="text-[12px] text-ink-soft">
                  {t("ui.phoneInputField.selectTheCountryOfYour")}</Text>
              </View>
              <Pressable
                onPress={() => setIsModalOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full bg-surface border border-line"
                accessibilityLabel={t("common.close")}
              >
                <XIcon size={15} color="#5D5F76" />
              </Pressable>
            </View>

            {/* Search Input */}
            <View className="p-4 border-b border-line-soft">
              <View className="flex-row items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
                <SearchIcon size={16} color="#9799AF" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t("ui.phoneInputField.searchForACountryOr")}
                  placeholderTextColor="#9799AF"
                  autoFocus={true}
                  className="flex-1 text-[14.5px] text-ink"
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery("")}>
                    <XIcon size={14} color="#9799AF" />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Countries List */}
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code + item.dialCode}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
              renderItem={({ item }) => {
                const isSelected =
                  item.code === selectedCountry.code &&
                  item.dialCode === selectedCountry.dialCode;

                return (
                  <PressableScale
                    onPress={() => handleSelectCountry(item)}
                    accessibilityLabel={t("ui.phoneInputField.dialingCode", { name: item.name, dialCode: item.dialCode })}
                  >
                    <View
                      className={[
                        "mb-1.5 flex-row items-center justify-between rounded-lg px-3.5 py-3 border transition-colors",
                        isSelected
                          ? "bg-primary-soft border-primary/40"
                          : "bg-surface border-line/60 hover:bg-paper",
                      ].join(" ")}
                    >
                      <View className="flex-row items-center gap-3">
                        <Text className="text-[22px]">{item.flag}</Text>
                        <View>
                          <Text
                            className={[
                              "text-[14.5px] font-semibold",
                              isSelected ? "text-primary" : "text-ink",
                            ].join(" ")}
                          >
                            {item.name}
                          </Text>
                          <Text className="text-[12px] text-ink-soft">
                            {t("ui.phoneInputField.example", { placeholder: item.placeholder })}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row items-center gap-2.5">
                        <Text
                          className={[
                            "text-[14.5px] font-bold",
                            isSelected ? "text-primary" : "text-ink-soft",
                          ].join(" ")}
                        >
                          {item.dialCode}
                        </Text>
                        {isSelected && <CheckIcon size={16} color="#332E86" />}
                      </View>
                    </View>
                  </PressableScale>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
