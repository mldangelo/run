// Validate the title used as the default squash commit subject.
const pattern =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([A-Za-z0-9._/-]+\))?!?: \S(?:[^\r\n]*\S)?$/;
function isConventionalTitle(title: string) {
  return pattern.test(title);
}
if (import.meta.main) {
  if (!isConventionalTitle(process.env.PR_TITLE || '')) {
    console.error(
      'Use a conventional PR title, e.g. feat: add a run feed or fix(schedule)!: change date handling.',
    );
    process.exitCode = 1;
  } else {
    console.log('Pull request title is conventional.');
  }
}

export { isConventionalTitle };
