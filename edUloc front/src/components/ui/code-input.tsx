import { useRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { t as translate } from "@/i18n";

type CodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Nombre de chiffres attendus (défaut : 6). */
  length?: number;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
};

/**
 * Saisie d'un code numérique : N cases visuelles pilotées par UN SEUL champ de saisie réel.
 * Contrairement à N champs séparés, le collage (« 482913 »), la correction et le remplissage
 * automatique par SMS / e-mail (oneTimeCode) fonctionnent nativement.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  disabled,
  hasError,
  autoFocus = true,
  accessibilityLabel = translate("ui.codeInput.verificationCode"),
}: CodeInputProps) {
  const inputRef = useRef<TextInput>(null);
  const digits = value.replace(/\D/g, "").slice(0, length);
  const activeIndex = Math.min(digits.length, length - 1);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessible={false} className="w-full">
      <View className="flex-row justify-between gap-2">
        {Array.from({ length }, (_, index) => {
          const char = digits[index];
          const isActive = !disabled && index === activeIndex;
          return (
            <View
              key={index}
              className={[
                "h-[56px] flex-1 items-center justify-center rounded-md border bg-surface",
                hasError ? "border-error" : isActive ? "border-primary" : char ? "border-ink-faint" : "border-line",
              ].join(" ")}
            >
              <Text className="text-[24px] font-bold text-ink">{char ?? ""}</Text>
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={digits}
        onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, length))}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        caretHidden
        accessibilityLabel={accessibilityLabel}
        // Champ réel invisible posé sur les cases : il reçoit le focus, le clavier et le collage.
        style={{ position: "absolute", inset: 0, opacity: 0.01, color: "transparent" }}
      />
    </Pressable>
  );
}
