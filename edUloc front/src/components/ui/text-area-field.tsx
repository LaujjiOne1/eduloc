import { Text, TextInput, View } from "react-native";

type TextAreaFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  error?: string;
  /** Hauteur minimale du champ (px). */
  minHeight?: number;
  hint?: string;
};

/** Champ texte multiligne dans le style de TextField (libellé, bordure, message d'erreur). */
export function TextAreaField({ label, value, onChangeText, placeholder, editable = true, error, minHeight = 90, hint }: TextAreaFieldProps) {
  return (
    <View className="mb-[14px]">
      <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9799AF"
        editable={editable}
        multiline
        textAlignVertical="top"
        accessibilityLabel={label}
        style={{ minHeight }}
        className={[
          "rounded-sm border bg-surface px-[14px] py-[13px] text-[15px] text-ink",
          error ? "border-error" : "border-line",
          editable ? "" : "opacity-50",
        ].join(" ")}
      />
      {hint ? <Text className="ml-0.5 mt-[6px] text-[12px] leading-[17px] text-ink-faint">{hint}</Text> : null}
      {error ? <Text className="ml-0.5 mt-[6px] text-[12.5px] text-error">{error}</Text> : null}
    </View>
  );
}
