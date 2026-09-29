import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Radio,
  Switch,
  Textarea,
} from "@tradesstack/shared-ui";
import { Button as CompatibilityButton } from "@/components/ui/button";

describe("@tradesstack/shared-ui public primitives", () => {
  it("preserves representative class and DOM contracts", () => {
    const html = renderToStaticMarkup(
      <>
        <Badge variant="outline" className="custom-badge">Badge</Badge>
        <Button variant="orange" size="sm" disabled>Save</Button>
        <Card>
          <CardHeader><CardTitle>Title</CardTitle><CardDescription>Description</CardDescription></CardHeader>
          <CardContent>Content</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
        <Checkbox aria-label="Accept" disabled />
        <Input type="file" size="toolbar" placeholder="Name" />
        <Radio name="choice" aria-label="Choice" />
        <Textarea placeholder="Notes" />
      </>,
    );

    expect(html).toContain("custom-badge");
    expect(html).toContain("bg-[var(--orange-primary)]");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('type="file"');
    expect(html).toContain('type="radio"');
    expect(html).toContain("ui-card");
    expect(html).toContain("Title");
  });

  it("preserves switch state and ARIA", () => {
    const onCheckedChange = vi.fn();
    const html = renderToStaticMarkup(<Switch checked onCheckedChange={onCheckedChange} aria-label="Enabled" />);

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("translate-x-5");
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("keeps old component imports as compatibility shims", () => {
    expect(CompatibilityButton).toBe(Button);
  });
});
