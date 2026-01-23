import type { Issue } from "@shared/schema";

export class FixEngine {
  constructor(private instance: any) {}

  async applyFix(issue: Issue): Promise<{ success: boolean; method?: string; error?: string }> {
    const { suggestedFix } = issue;

    for (const strategy of suggestedFix.fallbackOrder) {
      try {
        switch (strategy) {
          case "form_field":
            const formSuccess = await this.tryFormFieldFix(issue);
            if (formSuccess) {
              return { success: true, method: "form_field" };
            }
            break;

          case "content_edit":
            const contentSuccess = await this.tryContentEditFix(issue);
            if (contentSuccess) {
              return { success: true, method: "content_edit" };
            }
            break;

          case "redaction_overlay":
            const redactionSuccess = await this.tryRedactionOverlay(issue);
            if (redactionSuccess) {
              return { success: true, method: "redaction_overlay" };
            }
            break;
        }
      } catch (err) {
        console.warn(`Strategy ${strategy} failed:`, err);
        continue;
      }
    }

    return { success: false, error: "All strategies failed" };
  }

  private async tryFormFieldFix(issue: Issue): Promise<boolean> {
    if (!issue.formFieldName || !issue.expectedValue) {
      return false;
    }

    try {
      const formFields = await this.instance.getFormFields();
      const targetField = formFields.find((f: any) => f.name === issue.formFieldName);

      if (!targetField) {
        return false;
      }

      await this.instance.setFormFieldValues([
        {
          name: issue.formFieldName,
          value: issue.expectedValue,
        },
      ]);

      return true;
    } catch (err) {
      console.error("Form field fix failed:", err);
      return false;
    }
  }

  private async tryContentEditFix(issue: Issue): Promise<boolean> {
    if (!issue.foundValue || !issue.expectedValue) {
      return false;
    }

    try {
      const session = await this.instance.beginContentEditingSession();
      const textBlocks = await session.getTextBlocks(issue.pageIndex);

      const targetBlock = textBlocks.find((block: any) => {
        const blockRect = block.boundingBox;
        const issueRect = issue.rect;

        const overlaps =
          blockRect.left < issueRect.left + issueRect.width &&
          blockRect.left + blockRect.width > issueRect.left &&
          blockRect.top < issueRect.top + issueRect.height &&
          blockRect.top + blockRect.height > issueRect.top;

        return overlaps && block.text.includes(issue.foundValue);
      });

      if (!targetBlock) {
        await session.cancel();
        return false;
      }

      const updatedText = targetBlock.text.replace(issue.foundValue, issue.expectedValue);
      await session.updateTextBlocks([
        {
          id: targetBlock.id,
          text: updatedText,
        },
      ]);

      await session.commit();
      return true;
    } catch (err) {
      console.error("Content edit fix failed:", err);
      return false;
    }
  }

  private async tryRedactionOverlay(issue: Issue): Promise<boolean> {
    if (!issue.expectedValue) {
      return false;
    }

    try {
      const Annotations = await this.instance.Annotations;
      const Geometry = await this.instance.Geometry;

      const redaction = new Annotations.RedactionAnnotation({
        pageIndex: issue.pageIndex,
        boundingBox: new Geometry.Rect(issue.rect),
        overlayText: issue.expectedValue,
      });

      await this.instance.create(redaction);
      return true;
    } catch (err) {
      console.error("Redaction overlay failed:", err);
      return false;
    }
  }
}
