import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { TakeoffSourceDrawingUpload } from "./TakeoffSourceDrawingUpload";
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/components/app/useTakeoffSourceDrawingUpload", () => ({
  useTakeoffSourceDrawingUpload: upload,
}));
vi.mock("@/lib/fonts", () => ({ ibmPlexSans: { className: "font" }, interMedium: { className: "font" } }));
it("adapts the legacy opportunity route prop to the owner contract without changing its project", () => {
  upload.mockReturnValue({ inputRef: { current: null }, isUploading: false, status: null, error: null, onChooseFile: vi.fn(), onFileChange: vi.fn(), uploadFile: vi.fn() });
  renderToStaticMarkup(<TakeoffSourceDrawingUpload opportunityId="opportunity-slug" organizationId="org-1" projectId="workspace-project-1" />);
  expect(upload).toHaveBeenCalledWith({ owner: { kind: "opportunity", slug: "opportunity-slug" }, organizationId: "org-1", projectId: "workspace-project-1" });
});
