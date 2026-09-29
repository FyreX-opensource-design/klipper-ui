function editorLanguageForPath(path) {
    const name = (path || '').split('/').pop().toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (ext === 'py') {
        return { mode: 'python', label: 'Python' };
    }
    if (ext === 'yaml' || ext === 'yml') {
        return { mode: 'yaml', label: 'YAML' };
    }
    if (ext === 'json') {
        return { mode: { name: 'javascript', json: true }, label: 'JSON' };
    }
    if (ext === 'cfg' || ext === 'conf' || ext === 'ini') {
        return { mode: 'properties', label: ext.toUpperCase() };
    }
    return { mode: 'properties', label: 'Text' };
}

function createHighlightedEditor(textarea, path) {
    if (!textarea || typeof CodeMirror === 'undefined') {
        return null;
    }
    const language = editorLanguageForPath(path);
    const editor = CodeMirror.fromTextArea(textarea, {
        mode: language.mode,
        lineNumbers: true,
        lineWrapping: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        matchBrackets: true,
        extraKeys: {
            Tab: (cm) => cm.execCommand('insertSoftTab')
        }
    });
    editor.setSize('100%', '100%');
    return { editor, language };
}

function getHighlightedEditorValue(cm, textarea) {
    if (cm) {
        return cm.getValue();
    }
    return textarea ? textarea.value : '';
}

function setHighlightedEditorValue(cm, textarea, value) {
    if (cm) {
        const cursor = cm.getCursor();
        cm.setValue(value);
        cm.setCursor(cursor);
        cm.refresh();
        return;
    }
    if (textarea) {
        textarea.value = value;
    }
}
