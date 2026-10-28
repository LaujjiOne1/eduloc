import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

export type TabOption<T extends string = string> = {
  id: T;
  label: string;
  icon?: (props: { size?: number; color?: string }) => ReactNode;
};

export type SegmentedTabSwitchProps<T extends string = string> = {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedTabSwitch<T extends string>({
  options,
  value,
  onChange,
}: SegmentedTabSwitchProps<T>) {
  return (
    <View className="flex-row rounded-full bg-paper-alt p-1">
      {options.map((option) => {
        const isSelected = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={{ flex: 1 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
          >
            <View
              className={[
                "flex-row items-center justify-center gap-[6px] rounded-full py-[9px]",
                isSelected ? "bg-surface" : "bg-transparent",
              ].join(" ")}
              style={
                isSelected
                  ? {
                      shadowColor: "#14162B",
                      shadowOpacity: 0.08,
                      shadowRadius: 3,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: 2,
                    }
                  : undefined
              }
            >
              {option.icon?.({
                size: 15,
                color: isSelected ? "#14162B" : "#585B78",
              })}
              <Text
                className={[
                  "text-[13.5px]",
                  isSelected ? "font-bold text-ink" : "font-semibold text-ink-soft",
                ].join(" ")}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
