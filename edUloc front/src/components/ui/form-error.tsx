import { Text, View } from "react-native";

/** Inline banner for a submit-level error (invalid credentials, network, etc.). */
export function FormError({ message }: { message: string }) {
  return (
    <View className="mb-[14px] rounded-sm bg-error-tint px-[14px] py-[11px]">
      <Text className="text-[13.5px] text-error">{message}</Text>
    </View>
  );
}
