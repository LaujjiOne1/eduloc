import type { KeyboardTypeOptions } from "react-native";
import { Text, TextInput, type TextInputProps, View } from "react-native";

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  error?: string;
  editable?: boolean;
};

/** Labeled text input matching the EduLoc .field-label / .input styles. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "sentences",
  autoComplete,
  textContentType,
  error,
  editable = true,
}: TextFieldProps) {
  return (
    <View className="mb-[14px]">
      <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9799AF"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        editable={editable}
        accessibilityLabel={label}
        className={[
          "rounded-sm border bg-surface px-[14px] py-[13px] text-[15px] text-ink",
          error ? "border-error" : "border-line",
          editable ? "" : "opacity-50",
        ].join(" ")}
      />
      {error ? <Text className="mb-0 mt-[6px] ml-0.5 text-[12.5px] text-error">{error}</Text> : null}
    </View>
  );
}
