import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TypeDesignationField, type TypeDesignationOption } from "./type-designation-field";

// The trigger's className hook (ReferenceCombobox's `triggerClassName`
// pattern): the admin typical-wine editor passes its 44px touch class, and a
// caller that passes nothing keeps the trigger it had.

const OPTIONS: TypeDesignationOption[] = [
  { id: "d1", name: "Grand Cru Classé", category: "Quality Classification", country_id: null },
];
const noop = () => {};
const TAP = "min-h-11 md:pointer-fine:min-h-0";

/** The trigger button's class attribute. */
function triggerClass(html: string): string {
  const button = html.slice(html.indexOf("<button"));
  return button.match(/class="([^"]*)"/)![1];
}

describe("TypeDesignationField's trigger", () => {
  it("takes a caller's triggerClassName on top of its own classes", () => {
    const html = renderToStaticMarkup(
      <TypeDesignationField
        formFieldName="designation_add"
        options={OPTIONS}
        value=""
        onValueChange={noop}
        placeholder="Add a designation"
        allowClear={false}
        triggerClassName={TAP}
      />,
    );
    const cls = triggerClass(html).split(" ");
    expect(cls).toEqual(expect.arrayContaining(["w-full", "justify-between", "font-normal", "min-h-11", "md:pointer-fine:min-h-0"]));
    expect(html).toContain("Add a designation");
  });

  it("is unchanged for a caller that passes none", () => {
    const withNone = renderToStaticMarkup(
      <TypeDesignationField formFieldName="type_designation_id" options={OPTIONS} value="d1" onValueChange={noop} />,
    );
    const withUndefined = renderToStaticMarkup(
      <TypeDesignationField
        formFieldName="type_designation_id"
        options={OPTIONS}
        value="d1"
        onValueChange={noop}
        triggerClassName={undefined}
      />,
    );
    expect(withUndefined).toBe(withNone);
    expect(triggerClass(withNone)).not.toContain("min-h-11");
    expect(triggerClass(withNone).split(" ")).toEqual(expect.arrayContaining(["w-full", "justify-between", "font-normal"]));
    expect(withNone).toContain("Grand Cru Classé");
  });
});
