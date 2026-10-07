import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React from "react";

interface IProps {
  items: { label: string; value: string; group: string }[];
}
export function SelectGroups(props: IProps) {
  const { items } = props;

  // Get groups names
  const groups = Array.from(new Set(items.map((item) => item.group)));
  return (
    <Select items={items}>
      <SelectTrigger className="w-full max-w-48 bg-red">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <React.Fragment key={group}>
            <SelectGroup>
              <SelectLabel>{group}</SelectLabel>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}
