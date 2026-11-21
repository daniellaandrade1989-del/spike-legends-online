        frameId = requestAnimationFrame(tick);
      }
    };

    const spawnInitialPreviewRigs = () => {
      const previewLeft = buildAnimeCharacter(matchConfigRef.current.localCharacterId, 'left');
      previewLeft.root.position.set(-(COURT.HALF_WIDTH + 0.85), 0, 0);
      const animLeft = new PlayerAnimatorController();
      updateCharacterRigAnimation(previewLeft, 'idle', 0, 0, 0, 1, 0, false, 0.016, animLeft.getResolvedState());
      scene.add(previewLeft.root);
      playerRigs.set(matchConfigRef.current.localPlayerId, {
        rig: previewLeft,
        characterId: matchConfigRef.current.localCharacterId,
        team: 'left',
        animator: animLeft,
      });

      const setterPreviewChar: CharacterId = matchConfigRef.current.localCharacterId === 'hana' ? 'ren' : 'hana';
      const previewSetter = buildAnimeCharacter(setterPreviewChar, 'left');
      previewSetter.root.position.set(-1.45, 0, 0);
      const animSetter = new PlayerAnimatorController();
      updateCharacterRigAnimation(previewSetter, 'idle', 0.4, 0, 0, 1, 0, false, 0.016, animSetter.getResolvedState());
      scene.add(previewSetter.root);
      playerRigs.set('ally_setter', {
        rig: previewSetter,
        characterId: setterPreviewChar,
        team: 'left',
        animator: animSetter,
      });

      const previewRight = buildAnimeCharacter('yuki', 'right');
      previewRight.root.position.set(4.6, 0, 0);
      const animRight = new PlayerAnimatorController();
      updateCharacterRigAnimation(previewRight, 'idle', 0.8, 0, 0, -1, 0, false, 0.016, animRight.getResolvedState());
      scene.add(previewRight.root);
      playerRigs.set('opp_1', {
        rig: previewRight,
        characterId: 'yuki',
        team: 'right',
        animator: animRight,
      });

      const previewRightPartner = buildAnimeCharacter('kai', 'right');
      previewRightPartner.root.position.set(1.65, 0, 0);
      const animRightPartner = new PlayerAnimatorController();
      updateCharacterRigAnimation(previewRightPartner, 'idle', 1.1, 0, 0, -1, 0, false, 0.016, animRightPartner.getResolvedState());
      scene.add(previewRightPartner.root);
      playerRigs.set('opp_2', {
        rig: previewRightPartner,
        characterId: 'kai',
        team: 'right',
        animator: animRightPartner,
      });

      builtArena.ballMesh.position.set(-(COURT.HALF_WIDTH + 0.65), 2.8, 0);
      builtArena.ballShadow.position.set(-(COURT.HALF_WIDTH + 0.65), 0.014, 0);
    };
    spawnInitialPreviewRigs();

    if (screenStateRef.current === 'title') {
      camera.position.set(0, 5.4, 28.0);
      camera.lookAt(0, 1.65, 0);
    }
    renderer.render(scene, camera);

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      window.clearInterval(simHeartbeatId);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', clearInputs);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);

      clearRigs();
      builtArena.dispose();
      vfx.dispose();
      envTex.dispose();
      if (localWorld) localWorld.dispose();
      if (replayControlRef) replayControlRef.current = null;
      customSoundtrackManager.stopCrowd();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden">
      <div
        ref={mountRef}
        data-testid="game-canvas-mount"
        className="w-full h-full"
      />
      <div
        ref={flashOverlayRef}
        data-testid="impact-flash-overlay"
        style={{ opacity: 0, backgroundColor: 'rgba(255, 244, 196, 1)' }}
        className="pointer-events-none fixed inset-0 z-10"
      />
    </div>
  );
};
