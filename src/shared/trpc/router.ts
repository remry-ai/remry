// App router - aggregates all domain routers.
// Every new domain registers its router here.

import { router } from './init';
import { healthRouter } from '$api/health/routes';
import { brandingRouter } from '$api/branding/routes';
import { projectRouter } from '$api/project/routes';
import { goalRouter } from '$api/goal/routes';
import { pageRouter } from '$api/page/routes';
import { pageKindRouter } from '$api/page-kind/routes';
import { relationRouter } from '$api/relation/routes';
import { personRelationRouter } from '$api/person-relation/routes';
import { personRelationKindRouter } from '$api/person-relation-kind/routes';
import { todoRouter } from '$api/attached/todo/routes';
import { personRouter } from '$api/person/routes';
import { groupRouter } from '$api/group/routes';
import { groupKindRouter } from '$api/group-kind/routes';
import { docRouter } from '$api/attached/doc/routes';
import { reportRouter } from '$api/attached/report/routes';
import { noteRouter } from '$api/attached/note/routes';
import { linkRouter } from '$api/attached/link/routes';
import { tagRouter } from '$api/attached/tag/routes';
import { commentRouter } from '$api/attached/comment/routes';
import { emojiRouter } from '$api/attached/emoji/routes';
import { trpcMetaRouter } from '$api/trpc-meta/routes';
import { homeRouter } from '$api/home/routes';
import { notebookRouter } from '$api/notebook/routes';
import { chatRouter } from '$api/assist/routes';
import { searchRouter } from '$api/search/routes';
import { licenseRouter } from '$api/license/routes';

export const appRouter = router({
  notebook: notebookRouter,
  health: healthRouter,
  home: homeRouter,
  search: searchRouter,
  license: licenseRouter,
  branding: brandingRouter,
  project: projectRouter,
  goal: goalRouter,
  page: pageRouter,
  pageKind: pageKindRouter,
  relation: relationRouter,
  personRelation: personRelationRouter,
  personRelationKind: personRelationKindRouter,
  todo: todoRouter,
  person: personRouter,
  group: groupRouter,
  groupKind: groupKindRouter,
  doc: docRouter,
  report: reportRouter,
  note: noteRouter,
  link: linkRouter,
  tag: tagRouter,
  comment: commentRouter,
  emoji: emojiRouter,
  chat: chatRouter,
  trpcMeta: trpcMetaRouter
});

export type AppRouter = typeof appRouter;
