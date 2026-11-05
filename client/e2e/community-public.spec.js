import {test,expect} from '@playwright/test'
async function guestFixture(page){
  await page.route('**/*.supabase.co/**',route=>route.abort())
  await page.route('**/__public-community-api.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export * from '/src/utils/api.js';
    import * as original from '/src/utils/api.js';
    export const USING_SUPABASE=true;
    export const getCurrentUser=async()=>sessionStorage.getItem('public-community-login')?{id:'test-user',email:'test@example.invalid'}:null;
    export const onAuthChange=()=>()=>{};
    export const signIn=async()=>{sessionStorage.setItem('public-community-login','1')};
    const guest = group => ({...group,visibility:'public',myStatus:null,myRsvpId:null,myEventStatus:null,inviteToken:null,myInvite:null,plan:null});
    export async function getGroups(){return [guest(await original.getGroup({id:'grp2'}))];}
    export async function getGroup(target){return guest(await original.getGroup(target));}
  `}));
  await page.route(/\/src\/(?:router\/index\.js|components\/(?:NavBar\.vue|community\/GroupCard\.vue)|views\/(?:CommunityView|GroupView|LandingView|LoginView)\.vue|utils\/communityAccount\.js)(?:\?.*)?$/,async route=>{
    const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/from (["'])\/src\/utils\/api(?:\.js)?\1/g,'from "/__public-community-api.js"')})
  });
}
test('guests browse Community and group details; joining returns to that group after mock login',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await guestFixture(page);
 await page.goto('/community');await expect(page.getByRole('heading',{level:1,name:'Go together'})).toBeVisible();
 await expect(page.locator('#group-grp2')).toBeVisible();
 await expect(page.getByText('Find your people',{exact:true})).toBeVisible();
 await page.locator('#group-grp2').getByRole('link',{name:'View group',exact:true}).click();
 await expect(page).toHaveURL(/\/groups\/grp2$/);
 await page.getByRole('button',{name:'Join group',exact:true}).click();
 await expect(page).toHaveURL(/redirect=.*grp2.*#join-dino$/);
 await expect(page.getByLabel('Email',{exact:true})).toBeFocused();
 // Credentials are synthetic and the sign-in function above is entirely mocked.
 await page.getByLabel('Email',{exact:true}).fill('test@example.invalid');
 await page.getByLabel('Password',{exact:true}).fill('ExamplePassword123!');
 await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/\/groups\/grp2$/);
 for(const width of [375,575,768,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('main')).toHaveCount(1)}
 expect(errors).toEqual([]);
});
test('guest Start a group preserves the composer destination through sign in',async({page})=>{
 await guestFixture(page);await page.goto('/community');
 await page.getByRole('button',{name:'Start a group',exact:true}).click();
 await expect(page).toHaveURL(/redirect=.*compose.*#join-dino$/);
 await expect(page.getByLabel('Email',{exact:true})).toBeFocused();
 await page.getByLabel('Email',{exact:true}).fill('test@example.invalid');
 await page.getByLabel('Password',{exact:true}).fill('ExamplePassword123!');
 await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/\/community\?compose=1$/);
 await expect(page.getByRole('dialog',{name:'Start a group',exact:true})).toBeVisible();
});
