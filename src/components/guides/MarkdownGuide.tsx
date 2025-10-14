import React from 'react';

const MarkdownGuide: React.FC = () => {
  return (
    <>
      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">📝</span>
          Headings
        </div>
        <div className="help-code">
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">✨</span>
          Text Formatting
        </div>
        <div className="help-code">
**bold text** or Ctrl+B

*italic text* or Ctrl+I

***bold and italic***

~~strikethrough~~
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">🔗</span>
          Links
        </div>
        <div className="help-example">
          <div className="help-example-title">Wiki Links (Internal)</div>
          <div className="help-example-content">
            <div className="help-code">
[[Another Note]]  → Links to another note in your vault

[[New Note]]  → Creates a new note if it doesn't exist
            </div>
          </div>
        </div>
        <div className="help-example">
          <div className="help-example-title">External Links</div>
          <div className="help-example-content">
            <div className="help-code">
[Link Text](https://example.com)  → External URL

Ctrl+Click on any link to open it
            </div>
          </div>
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">📋</span>
          Lists
        </div>
        <div className="help-code">
Unordered List:
- First item
- Second item
  - Nested item
  - Another nested item

Ordered List:
1. First item
2. Second item
3. Third item

Task List:
- [ ] Unchecked task
- [x] Checked task
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">💬</span>
          Quotes & Code
        </div>
        <div className="help-code">
Block Quote:
{`>`} This is a quote
{`>`} It can span multiple lines

Inline Code:
Use `code` for inline code

Code Block:
```javascript
function hello() {'{'}
  console.log("Hello World");
{'}'}
```
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">📊</span>
          Tables
        </div>
        <div className="help-code">
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">➖</span>
          Dividers
        </div>
        <div className="help-code">
Horizontal Rule:
---
or
***
        </div>
      </div>

      <div className="help-tip">
        <div className="help-tip-title">
          💡 Pro Tip
        </div>
        <div className="help-tip-content">
          Use <strong>[[wiki links]]</strong> to create connections between notes. These connections will appear in your knowledge graph!
        </div>
      </div>
    </>
  );
};

export default MarkdownGuide;
