/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
function readEnvironment(variableName) {
  const environmentValue = $.NSProcessInfo.processInfo.environment.objectForKey(variableName);
  return environmentValue ? environmentValue.js : undefined;
}

const runtimeFileSystem = {
  exists(path) {
    return $.NSFileManager.defaultManager.fileExistsAtPath(path);
  },
  readText(path) {
    return $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, undefined).js;
  },
  writeTextAtomic(path, text) {
    $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, undefined);
  },
  remove(path) {
    if (this.exists(path)) $.NSFileManager.defaultManager.removeItemAtPathError(path, undefined);
  },
  ensureDirectory(path) {
    $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, true, undefined, undefined);
  },
  modifiedAt(path) {
    return $.NSFileManager.defaultManager.attributesOfItemAtPathError(path, undefined).js.NSFileModificationDate.js.getTime();
  },
};
