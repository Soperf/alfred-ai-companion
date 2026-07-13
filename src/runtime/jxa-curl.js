/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
function startCurlRequest(request, outputPath, processPath, timeoutSeconds) {
  const task = $.NSTask.alloc.init;
  const outputPipe = $.NSPipe.pipe;
  task.executableURL = $.NSURL.fileURLWithPath('/usr/bin/curl');
  task.arguments = createCurlArguments(request, outputPath, timeoutSeconds);
  task.standardOutput = outputPipe;
  task.launchAndReturnError(false);
  runtimeFileSystem.writeTextAtomic(processPath, String(task.processIdentifier));
  return task.processIdentifier;
}

function terminateCurlRequest(processPath) {
  if (!runtimeFileSystem.exists(processPath)) return false;
  const processIdentifier = Number.parseInt(runtimeFileSystem.readText(processPath), 10);
  if (Number.isInteger(processIdentifier) && processIdentifier > 0) {
    $.NSProcessInfo.processInfo.processIdentifier;
    $.NSTask.launchedTaskWithLaunchPathArguments('/bin/kill', ['-TERM', String(processIdentifier)]);
  }
  runtimeFileSystem.remove(processPath);
  return true;
}
