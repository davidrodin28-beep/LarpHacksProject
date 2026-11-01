// Position drills are deliberately slower than the full sporting movement.
const step = (title, cue, goal) => ({ title, cue, goal });
export const lessons = {
  Basketball: [
    { name: 'Set shot', focus: 'Balance, lift, follow through.', tip: 'Keep your shooting elbow under the imaginary ball. Finish with a relaxed wrist; the camera checks arm height, not ball control.', steps: [
      step('Set the ball', 'Stand balanced with soft knees. Bring both hands above shoulder height, as if preparing to shoot.', 'handsUp'),
      step('Hold your finish', 'Extend your shooting arm upward without locking the elbow. Let the wrist relax toward your target.', 'reachUp'),
    ] },
    { name: 'Chest pass', focus: 'A controlled push from the chest.', tip: 'Step toward your imaginary teammate as you pass. Finish with thumbs pointing down, then reset.', steps: [
      step('Prepare the pass', 'Hold the imaginary ball at chest height, with both elbows bent.', 'ready'),
      step('Extend toward the target', 'Push both hands forward at chest height. For this position drill, open your arms slightly so the camera can see both elbows.', 'extendBoth'),
    ] },
  ],
  Boxing: [
    { name: 'Jab', focus: 'Lead hand out. Straight back to guard.', tip: 'Work slowly in a comfortable staggered stance. Keep the rear hand near your cheek and avoid locking the punching elbow.', steps: [
      step('Find your guard', 'Bring both hands near your cheeks, keeping your elbows bent and shoulders relaxed.', 'guard'),
      step('Extend the lead hand', 'Slowly extend your lead arm around shoulder height. Keep the other hand near your cheek. Angle slightly across the camera so the elbow stays visible.', 'jab'),
      step('Return to guard', 'Bring the lead hand straight back to your cheek. Keep your chin gently tucked.', 'guard'),
    ] },
    { name: 'Cross', focus: 'Rear hand, body turn, recover.', tip: 'Use your rear hand. Turn your rear hip and heel together; the camera only checks the arm position, not the quality of your rotation.', steps: [
      step('Find your guard', 'Set a comfortable staggered stance with both hands near your cheeks.', 'guard'),
      step('Extend the rear hand', 'Turn gently through your rear hip as you extend the rear arm at shoulder height. Keep your lead hand up. Angle slightly across the camera.', 'cross'),
      step('Recover', 'Return your rear hand to your cheek and settle back into guard.', 'guard'),
    ] },
  ],
  Tennis: [
    { name: 'Ready position', focus: 'Stay balanced and ready to move.', tip: 'Keep your chest up, knees soft and imaginary racket in front. The camera checks the arms; use the cues to check your lower body.', steps: [
      step('Prepare to receive', 'Face the camera with bent elbows and both hands in front of your torso, below shoulder height.', 'ready'),
      step('Reset after a stroke', 'Relax both arms down briefly, then get ready to return to your receiving position.', 'relax'),
      step('Back to ready', 'Bring your hands back in front, with bent elbows and soft knees.', 'ready'),
    ] },
    { name: 'Serve preparation', focus: 'Rehearse the toss and high finish.', tip: 'Practice without a racket or ball. Move comfortably; this drill checks raised arms and does not assess toss accuracy or serve timing.', steps: [
      step('Rehearse the toss', 'Slowly lift your tossing hand above your head, keeping your gaze toward an imaginary ball.', 'reachUp'),
      step('Recover to ready', 'Lower your arms and return to a balanced ready position with bent elbows.', 'ready'),
    ] },
  ],
  Archery: [
    { name: 'Draw preparation', focus: 'Raise, draw, settle.', tip: 'Use an imaginary bow only. Stand side-on to your imaginary target, with your chest facing the camera. Keep the bow shoulder relaxed.', steps: [
      step('Raise the bow arm', 'Reach one arm out to the side at shoulder height, keeping a soft elbow.', 'sideReach'),
      step('Find your anchor', 'Keep the bow arm reaching sideways. Bring your drawing hand near your cheek and hold gently.', 'draw'),
    ] },
    { name: 'Controlled reset', focus: 'Settle the draw, then relax.', tip: 'This is a position rehearsal without equipment. The camera checks arm placement, not string alignment or release technique.', steps: [
      step('Set the draw position', 'Reach one arm sideways at shoulder height and bring the opposite hand near your cheek.', 'draw'),
      step('Lower and reset', 'Release the imaginary tension gently and lower both hands below your elbows.', 'relax'),
    ] },
  ],
  'Table tennis': [
    { name: 'Ready position', focus: 'Compact arms, quick recovery.', tip: 'Keep your weight forward with soft knees. Hold your imaginary bat in front; use small movements.', steps: [
      step('Get ready', 'Hold both hands in front of your torso with bent elbows, below shoulder height.', 'ready'),
      step('Relax and reset', 'Lower both hands briefly, keeping your shoulders relaxed.', 'relax'),
      step('Recover to ready', 'Bring your hands back in front and prepare for the next imaginary ball.', 'ready'),
    ] },
    { name: 'Forehand preparation', focus: 'A compact preparation and recovery.', tip: 'Turn your torso slightly for the backswing, then bring the bat forward and up. This drill checks preparation and recovery, not spin or contact.', steps: [
      step('Prepare your bat', 'Keep both elbows comfortably bent and your hands in front of your torso.', 'ready'),
      step('Rehearse a high finish', 'Slowly bring your bat hand above shoulder height. Keep the movement relaxed and compact.', 'handsUpSingle'),
      step('Recover', 'Return both hands to your ready position below shoulder height.', 'ready'),
    ] },
  ],
  Volleyball: [
    { name: 'Forearm pass', focus: 'Build a steady passing platform.', tip: 'Join your hands and keep a flat forearm platform. Move your feet to the imaginary ball; avoid a big arm swing.', steps: [
      step('Prepare', 'Start with soft knees and bent elbows, with both hands in front of your torso.', 'ready'),
      step('Build your platform', 'Bring your hands together below chest height and lengthen both arms without locking your elbows.', 'platform'),
    ] },
    { name: 'Overhead set', focus: 'Hands high, then extend.', tip: 'Shape your hands around an imaginary ball above your forehead. Extend smoothly toward your target; finger contact cannot be assessed here.', steps: [
      step('Hands above the forehead', 'Raise both hands above shoulder height with elbows bent, ready for the imaginary ball.', 'handsUp'),
      step('Extend upward', 'Gently extend both arms upward toward your target, keeping your hands above your head.', 'extendUp'),
    ] },
  ],
};
