import { redirect } from 'next/navigation';

// The board moved to the homepage; keep /gigs working for old links and bookmarks.
export default function GigsIndexPage() {
  redirect('/');
}
